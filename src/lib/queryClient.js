import { QueryClient } from '@tanstack/react-query'

// Cached server state for the whole app. Revisiting a page shows the cached
// data immediately and refreshes it in the background, instead of a spinner.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})
