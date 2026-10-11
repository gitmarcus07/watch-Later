import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { HitsGrid, formatHitDate, hitSubtitle } from '@/components/hits/HitsGrid';
import type { HitReportItem } from '@/features/hits/types';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function item(overrides: Partial<HitReportItem> & { tmdbId: number }): HitReportItem {
  return {
    rank: 1,
    mediaType: 'movie',
    title: `Hit ${overrides.tmdbId}`,
    releaseDate: '2026-08-06',
    popularity: 454.9,
    voteAverage: 7.6,
    voteCount: 536,
    ...overrides,
  };
}

function renderGrid(props: { items: HitReportItem[]; loading: boolean; loadError: boolean } & Partial<React.ComponentProps<typeof HitsGrid>>): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<HitsGrid emptyTitle="No eligible releases" emptyMessage="Nothing here." cardWidth={132} onRetry={() => undefined} onOpen={() => undefined} {...props} />);
  });
  return tree;
}

function textOf(tree: ReactTestRenderer): string {
  return JSON.stringify(tree.toJSON());
}

describe('hits grid states', () => {
  it('formats dates and subtitles with rating, votes, and popularity', () => {
    expect(formatHitDate('2026-08-06')).toBe('Aug 6');
    expect(formatHitDate('nope')).toBe('nope');
    expect(hitSubtitle(item({ tmdbId: 1 }))).toBe('Aug 6 · ★ 7.6 (536)');
  });

  it('shows loading skeletons while fetching', () => {
    const tree = renderGrid({ items: [], loading: true, loadError: false });
    expect(textOf(tree)).toContain('Loading rankings');
    tree.unmount();
  });

  it('shows an empty state when no titles qualify', () => {
    const tree = renderGrid({ items: [], loading: false, loadError: false });
    expect(textOf(tree)).toContain('No eligible releases');
    expect(textOf(tree)).toContain('Nothing here.');
    tree.unmount();
  });

  it('shows an error with a working retry action', () => {
    const onRetry = jest.fn();
    const tree = renderGrid({ items: [], loading: false, loadError: true, onRetry });
    expect(textOf(tree)).toContain('Something went wrong');
    tree.root.findByProps({ accessibilityLabel: 'Try again' }).props.onPress();
    expect(onRetry).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('renders ranked cards with titles, dates, ratings, and popularity', () => {
    const onOpen = jest.fn();
    const tree = renderGrid({
      items: [item({ tmdbId: 1, rank: 1 }), item({ tmdbId: 2, rank: 2, title: 'Second' })],
      loading: false,
      loadError: false,
      onOpen,
    });
    const text = textOf(tree);
    expect(text).toContain('Hit 1');
    expect(text).toContain('Second');
    expect(text).toContain('#1');
    expect(text).toContain('#2');
    expect(text).toContain('Popularity 454.9');
    tree.root.findAllByProps({ accessibilityRole: 'button' })[0].props.onPress();
    expect(onOpen).toHaveBeenCalledTimes(1);
    tree.unmount();
  });
});
