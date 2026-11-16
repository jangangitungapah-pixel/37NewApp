import { QueryClient } from '@tanstack/react-query';

/**
 * Spark-conservative defaults prevent unnecessary background refetches and keep read pressure low.
 */
export const DEFAULT_QUERY_OPTIONS = Object.freeze({
  queries: {
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  mutations: {
    retry: 0,
  },
});

export function createAppQueryClient(overrides = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        ...DEFAULT_QUERY_OPTIONS.queries,
        ...(overrides.queries || {}),
      },
      mutations: {
        ...DEFAULT_QUERY_OPTIONS.mutations,
        ...(overrides.mutations || {}),
      },
    },
  });
}

export const appQueryClient = createAppQueryClient();
