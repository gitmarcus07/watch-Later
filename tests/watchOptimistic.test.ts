import { QueryClient } from '@tanstack/react-query';
import type { CatalogMedia } from '@/domain/models/media';
import { movieWatchedOptimism } from '@/features/watchState/hooks';

const media: CatalogMedia = {
  provider: 'tmdb', mediaType: 'movie', providerId: '1',
  id: 'tmdb:movie:1', title: 'Film 1', genres: [], episodeMetadata: 'available',
};

describe('watched button optimism', () => {
  it('flips to watched instantly and rolls back on failure', async () => {
    const client = new QueryClient();
    const optimism = movieWatchedOptimism(client, media, true);
    client.setQueryData(optimism.key, false);
    const context = await optimism.apply();
    // The write has not run at all — the button already shows watched.
    expect(client.getQueryData(optimism.key)).toBe(true);
    optimism.settle();
    expect(client.getQueryData(optimism.key)).toBe(true);
    optimism.rollback(context);
    expect(client.getQueryData(optimism.key)).toBe(false);
    client.clear();
  });

  it('leaves untouched state alone when there was nothing before', async () => {
    const client = new QueryClient();
    const optimism = movieWatchedOptimism(client, media, true);
    const context = await optimism.apply();
    expect(client.getQueryData(optimism.key)).toBe(true);
    expect(context).toEqual({ previous: undefined });
    // Nothing to roll back to: stays on the optimistic value.
    optimism.rollback(context);
    expect(client.getQueryData(optimism.key)).toBe(true);
    client.clear();
  });
});
