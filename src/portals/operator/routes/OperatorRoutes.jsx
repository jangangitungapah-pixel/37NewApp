import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { PhaseFoundationDashboard } from '../../../features/dashboard/PhaseFoundationDashboard.jsx';
import { SessionSecurityProfilePage } from '../../../features/dashboard/SessionSecurityProfilePage.jsx';
import { OperatorLayout } from '../layout/OperatorLayout.jsx';

export function OperatorRoutes() {
  return (
    <Routes>
      <Route element={<OperatorLayout />}>
        <Route index element={<PhaseFoundationDashboard portalRole={ROLES.OPERATOR} />} />
        <Route path="profile" element={<SessionSecurityProfilePage />} />
        <Route path="*" element={<Navigate to="/operator" replace />} />
      </Route>
    </Routes>
  );
}
