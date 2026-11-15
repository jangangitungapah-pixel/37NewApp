/**
 * Centralized registry tracking all active Firestore realtime listeners.
 * Ensures clean unsubscribe on component unmount and full teardown on logout.
 */
export class SubscriptionRegistry {
  constructor() {
    /** @type {Map<string, () => void>} */
    this.listeners = new Map();
  }

  /**
   * Registers a named unsubscribe callback. Replaces and unsubscribes any
   * previous listener registered under the same key.
   *
   * @param {string} key
   * @param {() => void} unsubscribe
   */
  register(key, unsubscribe) {
    if (typeof unsubscribe !== 'function') {
      return;
    }
    this.unregister(key);
    this.listeners.set(key, unsubscribe);
  }

  /**
   * Unsubscribes and removes a single named listener.
   * @param {string} key
   */
  unregister(key) {
    const existing = this.listeners.get(key);
    if (typeof existing === 'function') {
      this.listeners.delete(key);
      try {
        existing();
      } catch {
        // Ignore teardown errors from already-closed streams
      }
    }
  }

  /**
   * Unsubscribes every active listener synchronously and clears the registry.
   * Must be invoked on logout and root provider unmount.
   */
  unsubscribeAll() {
    const entries = Array.from(this.listeners.entries());
    this.listeners.clear();
    for (const [, unsubscribe] of entries) {
      try {
        unsubscribe();
      } catch {
        // Continue tearing down remaining subscriptions
      }
    }
  }

  /**
   * @returns {number}
   */
  getActiveCount() {
    return this.listeners.size;
  }

  /**
   * @returns {string[]}
   */
  getActiveKeys() {
    return Array.from(this.listeners.keys());
  }
}

export const subscriptionRegistry = new SubscriptionRegistry();
