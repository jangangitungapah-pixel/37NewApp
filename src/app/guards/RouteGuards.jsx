import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthSession } from '../providers/authSessionContext.js';
import { canAccessPortal, resolveDefaultPortalPath } from '../../domain/policies/accessPolicy.js';
import { SessionLoadingSkeleton } from '../../shared/components/StatusFeedback.jsx';

export function RequireSessionStatus({ expectedStatus, children }) {
  const session = useAuthSession();

  if (session.status === 'config_error') {
    return <Navigate to="/config-error" replace />;
  }
  if (session.status === 'loading') {
    return <SessionLoadingSkeleton />;
  }
  if (session.status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (session.status === 'authenticated') {
    const target = resolveDefaultPortalPath(session.member) || '/access-denied';
    return <Navigate to={target} replace />;
  }
  if (session.status !== expectedStatus) {
    return <Navigate to={session.status === 'no_membership' ? '/onboarding' : '/access-denied'} replace />;
  }

  return children;
}

/**
 * UX route guard for authenticated portal scopes.
 * Real authorization is enforced by Firestore Security Rules.
 */
export function RequireActiveRole({ requiredRole }) {
  const session = useAuthSession();
  const location = useLocation();

  if (session.status === 'config_error') {
    return <Navigate to="/config-error" replace />;
  }
  if (session.status === 'loading') {
    return <SessionLoadingSkeleton />;
  }
  if (session.status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (session.status === 'no_membership') {
    return <Navigate to="/onboarding" replace />;
  }
  if (session.status === 'denied') {
    return <Navigate to="/access-denied" replace />;
  }
  if (!canAccessPortal(session.member, requiredRole)) {
    const fallbackPath = resolveDefaultPortalPath(session.member) || '/access-denied';
    return <Navigate to={fallbackPath} replace />;
  }

  return <Outlet />;
}

/**
 * Redirects already-authenticated users from public auth screens to their active portal.
 */
export function RedirectIfAuthenticated({ children }) {
  const session = useAuthSession();

  if (session.status === 'config_error') {
    return <Navigate to="/config-error" replace />;
  }
  if (session.status === 'loading') {
    return <SessionLoadingSkeleton />;
  }
  if (session.status === 'authenticated') {
    const target = resolveDefaultPortalPath(session.member);
    if (target) {
      return <Navigate to={target} replace />;
    }
  }
  if (session.status === 'no_membership') {
    return <Navigate to="/onboarding" replace />;
  }
  if (session.status === 'denied') {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}

/**
 * Root index resolver routing users based on current Firestore membership state.
 */
export function RootRedirect() {
  const session = useAuthSession();

  if (session.status === 'config_error') {
    return <Navigate to="/config-error" replace />;
  }
  if (session.status === 'loading') {
    return <SessionLoadingSkeleton />;
  }
  if (session.status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (session.status === 'no_membership') {
    return <Navigate to="/onboarding" replace />;
  }
  if (session.status === 'denied') {
    return <Navigate to="/access-denied" replace />;
  }

  const portalPath = resolveDefaultPortalPath(session.member) || '/access-denied';
  return <Navigate to={portalPath} replace />;
}
