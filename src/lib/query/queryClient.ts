import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // Local SQLite owns watch state; remote catalog data stays cached with
    // stale-while-refresh semantics so returning to a screen is instant.
    queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1 },
    mutations: { retry: 0 },
  },
});
