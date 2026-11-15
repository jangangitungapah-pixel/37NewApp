import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAppConfig, validateFirebaseEnv } from '../../infrastructure/config/env.js';
import { subscribeAuthState } from '../../data/repositories/authRepository.js';
import {
  ensureUserProfile,
  resolveMembershipForUser,
  subscribeBusinessDoc,
  subscribeMemberDoc,
} from '../../data/repositories/membershipRepository.js';
import { subscriptionRegistry } from '../../data/subscriptions/subscriptionRegistry.js';
import { mapFirebaseError } from '../../data/firebase/errorMapper.js';
import { signOutUseCase } from '../../application/use-cases/sessionUseCases.js';
import { isActiveMember } from '../../domain/policies/accessPolicy.js';
import { AuthSessionContext } from './authSessionContext.js';

const INITIAL_SESSION_STATE = {
  status: 'loading', // 'config_error' | 'loading' | 'unauthenticated' | 'no_membership' | 'denied' | 'authenticated'
  authUser: null,
  userProfile: null,
  member: null,
  business: null,
  fromCache: false,
  error: null,
  missingEnvKeys: [],
};

export function AuthSessionProvider({ children }) {
  const envCheck = useMemo(() => validateFirebaseEnv(), []);
  const appConfig = useMemo(() => getAppConfig(), []);

  const [session, setSession] = useState(() =>
    envCheck.valid
      ? INITIAL_SESSION_STATE
      : {
          ...INITIAL_SESSION_STATE,
          status: 'config_error',
          missingEnvKeys: envCheck.missingKeys,
        },
  );
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const clearSessionListeners = useCallback(() => {
    subscriptionRegistry.unsubscribeAll();
  }, []);

  const resetSensitiveState = useCallback(() => {
    setSession({
      ...INITIAL_SESSION_STATE,
      status: 'unauthenticated',
    });
  }, []);

  useEffect(() => {
    if (!envCheck.valid) {
      return undefined;
    }

    let isMounted = true;

    const unsubscribeAuth = subscribeAuthState(async (authUser) => {
      // Tear down prior membership/business listeners before resolving the new auth state
      subscriptionRegistry.unregister('session:member');
      subscriptionRegistry.unregister('session:business');

      if (!isMounted) {
        return;
      }

      if (!authUser) {
        subscriptionRegistry.unsubscribeAll();
        setSession({
          ...INITIAL_SESSION_STATE,
          status: 'unauthenticated',
        });
        return;
      }

      setSession((prev) => ({
        ...prev,
        status: 'loading',
        authUser,
        error: null,
      }));

      try {
        const profile = await ensureUserProfile(authUser);
        if (!isMounted) return;

        const preferredBusinessId = profile.defaultBusinessId || appConfig.defaultBusinessId;
        const initialMember = await resolveMembershipForUser({
          uid: authUser.uid,
          preferredBusinessId,
        });
        if (!isMounted) return;

        if (!initialMember) {
          setSession({
            ...INITIAL_SESSION_STATE,
            status: 'no_membership',
            authUser,
            userProfile: profile,
          });
          return;
        }

        if (!isActiveMember(initialMember)) {
          setSession({
            ...INITIAL_SESSION_STATE,
            status: 'denied',
            authUser,
            userProfile: profile,
            member: initialMember,
          });
          return;
        }

        // Subscribe to member doc so role/status changes by Owner propagate in real time
        const memberUnsub = subscribeMemberDoc({
          businessId: initialMember.businessId,
          uid: authUser.uid,
          onData: (liveMember, meta) => {
            if (!isMounted) return;
            if (!liveMember) {
              subscriptionRegistry.unregister('session:business');
              setSession((prev) => ({
                ...prev,
                status: 'no_membership',
                member: null,
                business: null,
                fromCache: meta.fromCache,
              }));
              return;
            }
            if (!isActiveMember(liveMember)) {
              subscriptionRegistry.unregister('session:business');
              setSession((prev) => ({
                ...prev,
                status: 'denied',
                member: liveMember,
                business: null,
                fromCache: meta.fromCache,
              }));
              return;
            }
            setSession((prev) => ({
              ...prev,
              status: 'authenticated',
              authUser,
              userProfile: profile,
              member: liveMember,
              fromCache: meta.fromCache,
              error: null,
            }));
          },
          onError: (err) => {
            if (!isMounted) return;
            setSession((prev) => ({
              ...prev,
              status: 'denied',
              error: err,
            }));
          },
        });
        subscriptionRegistry.register('session:member', memberUnsub);

        // Subscribe to scoped business root document
        const businessUnsub = subscribeBusinessDoc({
          businessId: initialMember.businessId,
          onData: (liveBusiness, meta) => {
            if (!isMounted) return;
            setSession((prev) => ({
              ...prev,
              business: liveBusiness,
              fromCache: prev.fromCache || meta.fromCache,
            }));
          },
          onError: (err) => {
            if (!isMounted) return;
            setSession((prev) => ({
              ...prev,
              error: err,
            }));
          },
        });
        subscriptionRegistry.register('session:business', businessUnsub);
      } catch (error) {
        if (!isMounted) return;
        const mapped = mapFirebaseError(error);
        setSession({
          ...INITIAL_SESSION_STATE,
          status: 'denied',
          authUser,
          error: mapped,
        });
      }
    });

    return () => {
      isMounted = false;
      unsubscribeAuth();
      clearSessionListeners();
    };
  }, [envCheck.valid, appConfig.defaultBusinessId, clearSessionListeners, reloadNonce]);

  const logout = useCallback(async () => {
    await signOutUseCase({
      registry: subscriptionRegistry,
      onResetState: resetSensitiveState,
    });
  }, [resetSensitiveState]);

  const refreshMembership = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      ...session,
      isOnline,
      appConfig,
      activeListenerCount: subscriptionRegistry.getActiveCount(),
      logout,
      refreshMembership,
    }),
    [session, isOnline, appConfig, logout, refreshMembership],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}
