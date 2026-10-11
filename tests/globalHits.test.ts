import {
  daysInMonth,
  daysUntilPublication,
  dueReportTargets,
  isPeriodComplete,
  lastCompletedMonth,
  lastCompletedYear,
  parseHitsPeriod,
  periodLabel,
  publicationDate,
  shiftMonthKey,
  shiftYearKey,
} from '@/features/hits/period';
import { buildHitsRanking, mergeHitPages, type HitCandidate } from '@/features/hits/ranking';
import { RemoteCatalogRepository } from '@/data/remote/catalog/RemoteCatalogRepository';
import { tmdbClient } from '@/data/remote/tmdb/client';

afterEach(() => jest.restoreAllMocks());

const OCT_2026 = new Date(Date.UTC(2026, 9, 11));
const JAN_2026 = new Date(Date.UTC(2026, 0, 5));

function candidate(overrides: Partial<HitCandidate> & { tmdbId: number }): HitCandidate {
  return { mediaType: 'movie', title: `Film ${overrides.tmdbId}`, ...overrides };
}

describe('hits calendar periods', () => {
  it('sizes February correctly in leap and common years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('sizes 30- and 31-day months', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('builds exact month bounds including leap February', () => {
    expect(parseHitsPeriod('month', '2024-02', OCT_2026)).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(parseHitsPeriod('month', '2023-02', OCT_2026)).toMatchObject({ from: '2023-02-01', to: '2023-02-28' });
    expect(parseHitsPeriod('month', '2026-08', OCT_2026)).toMatchObject({ from: '2026-08-01', to: '2026-08-31' });
    expect(parseHitsPeriod('month', '2026-04', OCT_2026)).toMatchObject({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('builds exact year bounds', () => {
    expect(parseHitsPeriod('year', '2025', OCT_2026)).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('rejects malformed, out-of-range, and future periods', () => {
    expect(parseHitsPeriod('month', '2026-13', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('month', '2026-8', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('month', 'Aug 2026', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('month', '1969-12', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('month', '2026-11', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('year', '2027', OCT_2026)).toBeNull();
    expect(parseHitsPeriod('year', '20', OCT_2026)).toBeNull();
  });

  it('accepts the in-progress current month', () => {
    expect(parseHitsPeriod('month', '2026-10', OCT_2026)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('detects completed periods', () => {
    expect(isPeriodComplete('month', '2026-09', OCT_2026)).toBe(true);
    expect(isPeriodComplete('month', '2026-10', OCT_2026)).toBe(false);
    expect(isPeriodComplete('year', '2025', OCT_2026)).toBe(true);
    expect(isPeriodComplete('year', '2026', OCT_2026)).toBe(false);
  });

  it('finds the last completed month across year boundaries', () => {
    expect(lastCompletedMonth(OCT_2026)).toBe('2026-09');
    expect(lastCompletedMonth(JAN_2026)).toBe('2025-12');
    expect(lastCompletedYear(OCT_2026)).toBe(2025);
  });

  it('schedules the monthly report plus the yearly one in January', () => {
    expect(dueReportTargets(new Set(), OCT_2026)).toEqual([{ type: 'month', key: '2026-09' }]);
    expect(dueReportTargets(new Set(), JAN_2026)).toEqual([
      { type: 'month', key: '2025-12' },
      { type: 'year', key: '2025' },
    ]);
  });

  it('never duplicates already-published reports', () => {
    expect(dueReportTargets(new Set(['month:2026-09']), OCT_2026)).toEqual([]);
    expect(dueReportTargets(new Set(['month:2025-12', 'year:2025']), JAN_2026)).toEqual([]);
    expect(dueReportTargets(new Set(['month:2025-12']), JAN_2026)).toEqual([{ type: 'year', key: '2025' }]);
  });

  it('labels periods and computes publication countdowns', () => {
    expect(periodLabel('month', '2026-08')).toBe('August 2026');
    expect(periodLabel('year', '2025')).toBe('2025');
    expect(publicationDate('month', '2026-09')).toBe('2026-10-01');
    expect(publicationDate('year', '2025')).toBe('2026-01-01');
    expect(daysUntilPublication('month', '2026-10', new Date(Date.UTC(2026, 9, 28)))).toBe(4);
    expect(daysUntilPublication('month', '2026-09', OCT_2026)).toBeNull();
  });

  it('steps month and year keys across boundaries', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01');
    expect(shiftMonthKey('2026-08', 0)).toBe('2026-08');
    expect(shiftMonthKey('nope', 1)).toBeNull();
    expect(shiftYearKey('2025', 1)).toBe('2026');
    expect(shiftYearKey('2025', -1)).toBe('2024');
    expect(shiftYearKey('20', 1)).toBeNull();
  });
});

describe('hits ranking', () => {
  const range = { from: '2026-08-01', to: '2026-08-31' };

  it('ranks eligible titles by popularity descending with stable ranks', () => {
    const items = buildHitsRanking([
      candidate({ tmdbId: 1, date: '2026-08-06', popularity: 100 }),
      candidate({ tmdbId: 2, date: '2026-08-20', popularity: 455.5 }),
      candidate({ tmdbId: 3, date: '2026-08-27', popularity: 200 }),
    ], range);
    expect(items.map((item) => item.tmdbId)).toEqual([2, 3, 1]);
    expect(items.map((item) => item.rank)).toEqual([1, 2, 3]);
  });

  it('keeps boundary dates and drops everything outside the period', () => {
    const items = buildHitsRanking([
      candidate({ tmdbId: 1, date: '2026-08-01', popularity: 10 }),
      candidate({ tmdbId: 2, date: '2026-08-31', popularity: 9 }),
      candidate({ tmdbId: 3, date: '2026-07-31', popularity: 999 }),
      candidate({ tmdbId: 4, date: '2026-09-01', popularity: 999 }),
    ], range);
    expect(items.map((item) => item.tmdbId)).toEqual([1, 2]);
  });

  it('excludes missing and invalid qualifying dates', () => {
    const items = buildHitsRanking([
      candidate({ tmdbId: 1, date: null, popularity: 999 }),
      candidate({ tmdbId: 2, date: undefined, popularity: 999 }),
      candidate({ tmdbId: 3, date: '', popularity: 999 }),
      candidate({ tmdbId: 4, date: '2026-02-30', popularity: 999 }),
      candidate({ tmdbId: 5, date: '2026-08', popularity: 999 }),
      candidate({ tmdbId: 6, date: '2026-08-06T00:00:00Z', popularity: 999 }),
      candidate({ tmdbId: 7, date: '2026-08-06', popularity: 1 }),
    ], range);
    expect(items.map((item) => item.tmdbId)).toEqual([7]);
  });

  it('sinks unknown popularity to the bottom and respects the limit', () => {
    const items = buildHitsRanking([
      candidate({ tmdbId: 1, date: '2026-08-06', popularity: undefined }),
      candidate({ tmdbId: 2, date: '2026-08-06', popularity: 5 }),
    ], { ...range, limit: 1 });
    expect(items.map((item) => item.tmdbId)).toEqual([2]);
    const untruncated = buildHitsRanking([
      candidate({ tmdbId: 1, date: '2026-08-06', popularity: undefined }),
      candidate({ tmdbId: 2, date: '2026-08-06', popularity: 5 }),
    ], range);
    expect(untruncated.map((item) => item.tmdbId)).toEqual([2, 1]);
  });

  it('ranks series by first-air date with the same rules', () => {
    const items = buildHitsRanking([
      { tmdbId: 11, mediaType: 'series', title: 'Late', date: '2026-08-27', popularity: 50 },
      { tmdbId: 12, mediaType: 'series', title: 'Dateless', date: '', popularity: 500 },
      { tmdbId: 13, mediaType: 'series', title: 'Early', date: '2026-08-02', popularity: 80 },
    ], range);
    expect(items.map((item) => item.title)).toEqual(['Early', 'Late']);
  });

  it('merges fetched pages in order', () => {
    const merged = mergeHitPages([
      [candidate({ tmdbId: 1, date: '2026-08-01' })],
      [candidate({ tmdbId: 2, date: '2026-08-02' }), candidate({ tmdbId: 3, date: '2026-08-03' })],
    ]);
    expect(merged.map((item) => item.tmdbId)).toEqual([1, 2, 3]);
  });
});

describe('hits live preview repository', () => {
  function tmdbMovie(id: number, title: string, release_date: string | null, popularity: number) {
    return { id, title, release_date: release_date ?? undefined, popularity, vote_average: 7.1, vote_count: 42, poster_path: '/p.jpg' };
  }

  it('queries dated discover pages and ranks eligible releases', async () => {
    const discover = jest.spyOn(tmdbClient, 'discoverMovies').mockResolvedValue({
      results: [
        tmdbMovie(1, 'Dated Hit', '2026-08-06', 400),
        tmdbMovie(2, 'Dateless Noise', null, 999),
        tmdbMovie(3, 'Old News', '2026-07-30', 888),
      ],
      page: 1,
      total_pages: 1,
    });
    const live = await new RemoteCatalogRepository().getGlobalHitsLive('month', '2026-08', 'movie');
    expect(discover).toHaveBeenCalledWith(1, { releaseDateGte: '2026-08-01', releaseDateLte: '2026-08-31' }, undefined);
    expect(live.items.map((item) => item.title)).toEqual(['Dated Hit']);
    expect(live.items[0]).toMatchObject({ rank: 1, releaseDate: '2026-08-06' });
    expect(live.complete).toBe(true);
    expect(typeof live.retrievedAt).toBe('string');
  });

  it('walks bounded pages and stops at the last page', async () => {
    const discover = jest.spyOn(tmdbClient, 'discoverTv').mockImplementation(async (page) => ({
      results: page === 1
        ? [{ id: 9, name: 'Early Show', first_air_date: '2026-08-02', popularity: 10, vote_average: 6, vote_count: 5, poster_path: null }]
        : [],
      page,
      total_pages: 5,
    }));
    const live = await new RemoteCatalogRepository().getGlobalHitsLive('month', '2026-08', 'series');
    expect(discover).toHaveBeenCalledTimes(2);
    expect(discover.mock.calls[0][1]).toMatchObject({ firstAirDateGte: '2026-08-01', firstAirDateLte: '2026-08-31' });
    expect(live.items.map((item) => item.title)).toEqual(['Early Show']);
  });

  it('rejects invalid and future periods without fetching', async () => {
    const discover = jest.spyOn(tmdbClient, 'discoverMovies');
    await expect(new RemoteCatalogRepository().getGlobalHitsLive('month', '2999-01', 'movie')).rejects.toMatchObject({ code: 'not_found' });
    await expect(new RemoteCatalogRepository().getGlobalHitsLive('month', 'not-a-period', 'movie')).rejects.toMatchObject({ code: 'not_found' });
    expect(discover).not.toHaveBeenCalled();
  });

  it('surfaces provider failures instead of empty rankings', async () => {
    jest.spyOn(tmdbClient, 'discoverMovies').mockRejectedValue(new Error('offline'));
    await expect(new RemoteCatalogRepository().getGlobalHitsLive('month', '2026-08', 'movie')).rejects.toThrow('offline');
  });
});
