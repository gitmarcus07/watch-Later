import { readFileSync } from 'node:fs';
import { act, create } from 'react-test-renderer';
import { WatchLaterSheet } from '@/components/media/WatchLaterSheet';
import { PRIORITY_META, PRIORITY_ORDER, isWatchPriority, priorityLabel } from '@/features/watchState/priority';
import { groupByMonth, monthGroupKey, monthGroupLabel, timeAgo } from '@/lib/relativeTime';
import type { WatchPriority } from '@/domain/models/watchState';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('watch later priorities', () => {
  it('defines ASAP, Weekend, and Someday metadata in order', () => {
    expect(PRIORITY_ORDER).toEqual(['asap', 'weekend', 'someday']);
    expect(PRIORITY_META.asap).toMatchObject({ label: 'ASAP' });
    expect(PRIORITY_META.weekend).toMatchObject({ label: 'Weekend' });
    expect(PRIORITY_META.someday).toMatchObject({ label: 'Someday' });
    expect(isWatchPriority('asap')).toBe(true);
    expect(isWatchPriority('later')).toBe(false);
    expect(isWatchPriority(null)).toBe(false);
    expect(priorityLabel('someday')).toBe('Someday');
    expect(priorityLabel(null)).toBe('Saved');
  });

  it('renders the priority sheet with radio options and an optional remove action', async () => {
    const selected: WatchPriority[] = [];
    let removed = 0;
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<WatchLaterSheet visible saved={false} currentPriority={null} onSelect={(priority) => selected.push(priority)} onRemove={() => { removed += 1; }} onClose={() => undefined} />);
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'ASAP, Watch as soon as you can' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Weekend, Save for your next free weekend' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Someday, No rush — get to it when you can' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Remove from watchlist' })).toHaveLength(0);
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Weekend, Save for your next free weekend' }).props.onPress(); });
    expect(selected).toEqual(['weekend']);
    renderer.unmount();

    await act(async () => {
      renderer = create(<WatchLaterSheet visible saved currentPriority="someday" onSelect={(priority) => selected.push(priority)} onRemove={() => { removed += 1; }} onClose={() => undefined} />);
    });
    await act(async () => { renderer.root.findByProps({ accessibilityLabel: 'Remove from watchlist' }).props.onPress(); });
    expect(removed).toBe(1);
    renderer.unmount();
  });
});

describe('relative time and month grouping', () => {
  const now = new Date('2026-10-09T12:00:00');

  it('formats just now, minutes, hours, days, and absolute dates', () => {
    expect(timeAgo('2026-10-09T11:59:30', now)).toBe('just now');
    expect(timeAgo('2026-10-09T11:30:00', now)).toBe('30m ago');
    expect(timeAgo('2026-10-09T09:00:00', now)).toBe('3h ago');
    expect(timeAgo('2026-10-08T12:00:00', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-05T12:00:00', now)).toBe('4 days ago');
    expect(timeAgo('2026-09-25', now)).toBe('25 Sept 2026');
    expect(timeAgo(undefined, now)).toBe('');
    expect(timeAgo('not-a-date', now)).toBe('');
  });

  it('groups newest month first with an EARLIER tail for undated items', () => {
    expect(monthGroupKey('2026-10-09T11:59:30')).toBe('2026-10');
    expect(monthGroupLabel('2026-10')).toBe('OCTOBER 2026');
    expect(monthGroupLabel('')).toBe('EARLIER');
    const groups = groupByMonth(
      [{ at: '2026-09-25' }, { at: '2026-10-01' }, { at: undefined }, { at: '2026-10-08' }],
      (item) => item.at,
    );
    expect(groups.map((group) => group.label)).toEqual(['OCTOBER 2026', 'SEPTEMBER 2026', 'EARLIER']);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe('watchlist and watched screens', () => {
  it('watchlist filters by priority with relative-time rows and no reorder mode', () => {
    const screen = readFileSync('app/(tabs)/watchlist.tsx', 'utf8');
    expect(screen).toMatch(/PriorityFilter/);
    expect(screen).toMatch(/PRIORITY_ORDER/);
    expect(screen).toMatch(/PRIORITY_META/);
    expect(screen).toMatch(/Priority \$/);
    expect(screen).toMatch(/timeAgo/);
    expect(screen).not.toMatch(/Reorder/);
    expect(screen).not.toMatch(/Use arrows/);
    expect(screen).not.toMatch(/SortControl/);
    expect(screen).not.toMatch(/GenreFilter/);
  });

  it('watched groups by month with relative times and season pills', () => {
    const screen = readFileSync('app/(tabs)/watched.tsx', 'utf8');
    expect(screen).toMatch(/groupByMonth/);
    expect(screen).toMatch(/monthHeader/);
    expect(screen).toMatch(/badgeTone/);
    expect(screen).not.toMatch(/SortControl/);
    expect(screen).not.toMatch(/GenreFilter/);
  });

  it('browse pages every tab infinitely with a Bollywood shelf', () => {
    const browse = readFileSync('app/browse.tsx', 'utf8');
    for (const tab of ['Trending', 'Movies', 'Shows', 'Anime', 'Bollywood']) {
      expect(browse).toContain(`'${tab}'`);
    }
    expect(browse).toMatch(/onEndReached/);
    expect(browse).toMatch(/fetchNextPage/);
    expect(browse).toMatch(/usePopularAnimePages/);
    expect(browse).toMatch(/useBollywoodPages/);
  });

  it('home top bar exposes search next to the browse shortcut', () => {
    const bar = readFileSync('src/components/common/AppTopBar.tsx', 'utf8');
    expect(bar).toContain('/search');
    expect(bar).toContain('/browse');
    expect(bar).not.toContain('/(tabs)/search');
  });

  it('detail opens the priority sheet instead of navigating away', () => {
    const detail = readFileSync('app/media/[id].tsx', 'utf8');
    expect(detail).toMatch(/WatchLaterSheet/);
    expect(detail).toMatch(/setSheetOpen\(true\)/);
    expect(detail).not.toMatch(/router\.push\('\/\(tabs\)\/watchlist'\)/);
  });
});
