import { useEffect, useState } from 'react';
import { subscriptionRegistry } from '../../data/subscriptions/subscriptionRegistry.js';

/**
 * React hook bridging a Firestore scoped `onSnapshot` subscriber with the
 * global SubscriptionRegistry so listeners always tear down cleanly on unmount & logout.
 *
 * @template T
 * @param {string} key
 * @param {((callbacks: { onData: (data: T, meta?: { fromCache?: boolean }) => void, onError: (err: unknown) => void }) => () => void) | null} subscribeFn
 * @param {T} initialData
 */
export function useRegistrySubscription(key, subscribeFn, initialData) {
  const [state, setState] = useState(() => ({
    data: initialData,
    loading: Boolean(subscribeFn),
    error: null,
    fromCache: false,
  }));

  useEffect(() => {
    if (!subscribeFn) {
      subscriptionRegistry.unregister(key);
      return undefined;
    }

    let mounted = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    const unsubscribe = subscribeFn({
      onData: (data, meta) => {
        if (!mounted) return;
        setState({
          data,
          loading: false,
          error: null,
          fromCache: Boolean(meta?.fromCache),
        });
      },
      onError: (err) => {
        if (!mounted) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err,
        }));
      },
    });

    subscriptionRegistry.register(key, unsubscribe);

    return () => {
      mounted = false;
      subscriptionRegistry.unregister(key);
    };
  }, [key, subscribeFn]);

  if (!subscribeFn) {
    return {
      data: initialData,
      loading: false,
      error: null,
      fromCache: false,
    };
  }

  return state;
}
