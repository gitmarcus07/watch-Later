import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // Local SQLite owns watch state; remote catalog data stays cached with
    // stale-while-refresh semantics so returning to a screen is instant.
    // No refetch on foreground focus: mobile connections are flaky and a
    // refetch storm freezes episode lists and disables action buttons.
    queries: { staleTime: 60_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});
