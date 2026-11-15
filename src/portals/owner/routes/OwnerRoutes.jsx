import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { PhaseFoundationDashboard } from '../../../features/dashboard/PhaseFoundationDashboard.jsx';
import { SessionSecurityProfilePage } from '../../../features/dashboard/SessionSecurityProfilePage.jsx';
import { OwnerLayout } from '../layout/OwnerLayout.jsx';

export function OwnerRoutes() {
  return (
    <Routes>
      <Route element={<OwnerLayout />}>
        <Route index element={<PhaseFoundationDashboard portalRole={ROLES.OWNER} />} />
        <Route path="profile" element={<SessionSecurityProfilePage />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
}
