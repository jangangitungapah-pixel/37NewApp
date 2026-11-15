import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { CustomersPage } from '../../../features/customers/CustomersPage.jsx';
import { PhaseFoundationDashboard } from '../../../features/dashboard/PhaseFoundationDashboard.jsx';
import { SessionSecurityProfilePage } from '../../../features/dashboard/SessionSecurityProfilePage.jsx';
import { ServicesPricingPage } from '../../../features/services/ServicesPricingPage.jsx';
import { BusinessSettingsPage } from '../../../features/settings/BusinessSettingsPage.jsx';
import { StudiosPage } from '../../../features/studios/StudiosPage.jsx';
import { TeamManagementPage } from '../../../features/team/TeamManagementPage.jsx';
import { OwnerLayout } from '../layout/OwnerLayout.jsx';

export function OwnerRoutes() {
  return (
    <Routes>
      <Route element={<OwnerLayout />}>
        <Route index element={<PhaseFoundationDashboard portalRole={ROLES.OWNER} />} />
        <Route path="studios" element={<StudiosPage />} />
        <Route path="services" element={<ServicesPricingPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="team" element={<TeamManagementPage />} />
        <Route path="settings" element={<BusinessSettingsPage />} />
        <Route path="profile" element={<SessionSecurityProfilePage />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
}
