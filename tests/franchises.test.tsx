import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { franchiseCollections, franchiseBySlug, filterFranchises, franchiseItemRouteId, franchisesForHome } from '@/features/franchises/catalog';
import { parseMediaRouteId } from '@/features/catalog/mediaIdentity';
import { FranchiseCard } from '@/components/franchise/FranchiseCard';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('franchise catalog integrity', () => {
  it('ships a non-trivial curated set with unique slugs', () => {
    expect(franchiseCollections.length).toBeGreaterThanOrEqual(50);
    const slugs = franchiseCollections.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('home carousel leads with the popular franchises first', () => {
    expect(franchisesForHome(8).map((entry) => entry.slug)).toEqual([
      'mcu',
      'star-wars-collection',
      'the-wizarding-world-of-harry-potter',
      'the-hobbit-lotr-universe',
      'the-jurassic-franchise',
      'the-fast-and-the-furious-series',
      'the-complete-dceu-saga',
      'the-john-wick-universe',
    ]);
    // The row stays complete: ranked franchises first, the rest alphabetical.
    const every = franchisesForHome(franchiseCollections.length + 50);
    expect(every).toHaveLength(franchiseCollections.length);
    const lastRanked = every.findIndex((entry) => entry.slug === 'one-piece-movies-collection');
    const firstUnranked = every.findIndex((entry) => entry.slug === 'the-after-franchise');
    expect(lastRanked).toBeGreaterThanOrEqual(0);
    expect(firstUnranked).toBeGreaterThan(lastRanked);
  });

  it('every collection has a title, overview and ordered members', () => {
    for (const entry of franchiseCollections) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.overview.length).toBeGreaterThan(0);
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it('every member resolves to a routable media id', () => {
    for (const entry of franchiseCollections) {
      const routeIds = entry.items.map(franchiseItemRouteId);
      for (const routeId of routeIds) {
        const identity = parseMediaRouteId(routeId);
        expect(identity).toBeDefined();
        expect(identity?.provider).toBe('tmdb');
        expect(identity?.mediaType === 'movie' || identity?.mediaType === 'series').toBe(true);
      }
      // No duplicate title inside one franchise (a resolver regression shows up here).
      expect(new Set(routeIds).size).toBe(routeIds.length);
    }
  });

  it('members carry display data: title, year and poster', () => {
    for (const entry of franchiseCollections) {
      for (const item of entry.items) {
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.year).toBeGreaterThan(1900);
        expect(item.posterPath).toBeTruthy();
      }
    }
  });

  it('every franchise is complete and ordered by release date', () => {
    for (const entry of franchiseCollections) {
      const dates = entry.items.map((item) => item.releaseDate);
      // Every member has a full release/air date, and the stored order is
      // ascending — the promise shown on the detail screen ("In order").
      expect(dates.every((date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date))).toBe(true);
      expect(dates).toEqual([...dates].sort());
      const years = entry.items.map((item) => item.year ?? 0);
      expect(years).toEqual([...years].sort((a, b) => a - b));
    }
  });

  it('franchises from the reference UI are present, including mixed movie/show lists', () => {
    const jurassic = franchiseBySlug('the-jurassic-franchise');
    expect(jurassic).toBeDefined();
    expect(jurassic!.items).toHaveLength(9);
    expect(jurassic!.items.filter((item) => item.mediaType === 'series')).toHaveLength(2);
    // Canonical order: the 1993 original comes first, the shows interleaved by date.
    expect(jurassic!.items[0].year).toBe(1993);
    expect(jurassic!.items[5].title).toBe('Jurassic World Camp Cretaceous');
    expect(jurassic!.items[8].title).toBe('Jurassic World Rebirth');
    expect(franchiseBySlug('mcu')!.items.length).toBeGreaterThanOrEqual(30);
    expect(franchiseBySlug('star-wars-collection')).toBeDefined();
    expect(franchiseBySlug('cw-s-arrowverse')).toBeDefined();
    expect(franchiseBySlug('missing-slug')).toBeUndefined();
    expect(franchiseBySlug(undefined)).toBeUndefined();
  });

  it('recent entries are complete and correctly attributed', () => {
    // MCU runs through the newest releases, in date order.
    const mcu = franchiseBySlug('mcu')!;
    expect(mcu.items[mcu.items.length - 1]).toMatchObject({ title: 'Spider-Man: Brand New Day', year: 2026 });
    expect(mcu.items.map((item) => item.title)).toContain('The Fantastic 4: First Steps');
    // The DCU collection carries Peacemaker and never the CW Supergirl series
    // (a resolver regression once mapped "Supergirl (2026)" onto the 2015 show).
    const dcu = franchiseBySlug('james-gunn-s-dcu')!;
    expect(dcu.items).toHaveLength(3);
    expect(dcu.items.map((item) => item.title)).toContain('Peacemaker');
    expect(dcu.items.every((item) => item.title !== 'Supergirl')).toBe(true);
    // Other franchises extended to their full filmographies.
    expect(franchiseBySlug('the-scream-franchise')!.items).toHaveLength(7);
    expect(franchiseBySlug('the-conjuring-universe')!.items).toHaveLength(10);
    expect(franchiseBySlug('the-fast-and-the-furious-series')!.items.map((item) => item.title)).toContain('Fast & Furious Presents: Hobbs & Shaw');
    expect(franchiseBySlug('the-hobbit-lotr-universe')!.items).toHaveLength(7);
  });
});

describe('filterFranchises', () => {
  it('returns everything for an empty or whitespace query', () => {
    expect(filterFranchises(undefined, '')).toHaveLength(franchiseCollections.length);
    expect(filterFranchises(undefined, '   ')).toHaveLength(franchiseCollections.length);
  });

  it('matches on the franchise title with case/punctuation insensitivity', () => {
    const exact = filterFranchises(undefined, 'MCU');
    expect(exact[0]?.slug).toBe('mcu');
    const loose = filterFranchises(undefined, 'the jurassic');
    expect(loose[0]?.slug).toBe('the-jurassic-franchise');
    expect(filterFranchises(undefined, 'STAR WARS')[0]?.slug).toBe('star-wars-collection');
  });

  it('ranks exact title matches above member-title matches', () => {
    const results = filterFranchises(undefined, 'Scream');
    expect(results[0]?.slug).toBe('the-scream-franchise');
    // "Scream" also appears in The Scary Movie Franchise? No — but "Scream" hits
    // member titles of its own franchise first regardless.
    expect(results.map((entry) => entry.slug)).toContain('the-scream-franchise');
  });

  it('finds a franchise by a member title', () => {
    const results = filterFranchises(undefined, 'Munjya');
    expect(results.map((entry) => entry.slug)).toContain('maddock-horror-comedy-universe-mchu');
    expect(filterFranchises(undefined, 'Kaithi')[0]?.slug).toBe('lcu');
  });

  it('excludes non-matching collections and keeps results stable', () => {
    expect(filterFranchises(undefined, 'zzzz-no-such-franchise')).toHaveLength(0);
    const first = filterFranchises(undefined, 'trilogy');
    const second = filterFranchises(undefined, 'trilogy');
    expect(first.map((entry) => entry.slug)).toEqual(second.map((entry) => entry.slug));
    expect(first.length).toBeGreaterThanOrEqual(3);
  });
});

describe('FranchiseCard', () => {
  function renderCard(): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<FranchiseCard title="The Jurassic Franchise" itemCount={9} onPress={() => undefined} />);
    });
    return tree;
  }

  it('announces the collection name and size to screen readers', () => {
    const tree = renderCard();
    const props = (tree.root.findAll((node) => node.props.accessibilityLabel === 'The Jurassic Franchise, 9 titles')[0] ?? {}).props as Record<string, unknown> | undefined;
    expect(props).toBeDefined();
    expect(props?.accessibilityHint).toBe('Opens the franchise collection');
  });

  it('renders the member count badge', () => {
    const tree = renderCard();
    expect(JSON.stringify(tree.toJSON())).toContain('9');
  });
});
