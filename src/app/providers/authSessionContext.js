import { createContext, useContext } from 'react';

export const AuthSessionContext = createContext(null);

export function useAuthSession() {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession harus dipanggil di dalam AuthSessionProvider.');
  }
  return ctx;
}
