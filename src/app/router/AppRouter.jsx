import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../domain/enums/roles.js';
import {
  RedirectIfAuthenticated,
  RequireActiveRole,
  RequireSessionStatus,
  RootRedirect,
} from '../guards/RouteGuards.jsx';
import { LoginPage } from '../../features/auth/LoginPage.jsx';
import { OnboardingBusinessPage } from '../../features/auth/OnboardingBusinessPage.jsx';
import { AccessDeniedPage } from '../../features/auth/AccessDeniedPage.jsx';
import { ConfigErrorScreen } from '../../features/auth/ConfigErrorScreen.jsx';
import { lazyNamed } from './lazyNamed.js';
import { RouteSuspense } from './RouteSuspense.jsx';

const OwnerRoutes = lazyNamed(
  () => import('../../portals/owner/routes/OwnerRoutes.jsx'),
  'OwnerRoutes',
);
const OperatorRoutes = lazyNamed(
  () => import('../../portals/operator/routes/OperatorRoutes.jsx'),
  'OperatorRoutes',
);

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/config-error" element={<ConfigErrorScreen />} />
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireSessionStatus expectedStatus="no_membership">
            <OnboardingBusinessPage />
          </RequireSessionStatus>
        }
      />
      <Route
        path="/access-denied"
        element={
          <RequireSessionStatus expectedStatus="denied">
            <AccessDeniedPage />
          </RequireSessionStatus>
        }
      />

      <Route element={<RequireActiveRole requiredRole={ROLES.OWNER} />}>
        <Route
          path="/owner/*"
          element={
            <RouteSuspense label="Memuat Owner Portal...">
              <OwnerRoutes />
            </RouteSuspense>
          }
        />
      </Route>

      <Route element={<RequireActiveRole requiredRole={ROLES.OPERATOR} />}>
        <Route
          path="/operator/*"
          element={
            <RouteSuspense label="Memuat Operator Portal...">
              <OperatorRoutes />
            </RouteSuspense>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
