import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { BookingCalendarPage } from '../../../features/bookings/BookingCalendarPage.jsx';
import { CustomersPage } from '../../../features/customers/CustomersPage.jsx';
import { PhaseFoundationDashboard } from '../../../features/dashboard/PhaseFoundationDashboard.jsx';
import { SessionSecurityProfilePage } from '../../../features/dashboard/SessionSecurityProfilePage.jsx';
import { OperatorCommissionsPage } from '../../../features/finance/OperatorCommissionsPage.jsx';
import { ActivityTimelinePage } from '../../../features/notifications/ActivityTimelinePage.jsx';
import { ServicesPricingPage } from '../../../features/services/ServicesPricingPage.jsx';
import { StudiosPage } from '../../../features/studios/StudiosPage.jsx';
import { OperatorLayout } from '../layout/OperatorLayout.jsx';

export function OperatorRoutes() {
  return (
    <Routes>
      <Route element={<OperatorLayout />}>
        <Route index element={<PhaseFoundationDashboard portalRole={ROLES.OPERATOR} />} />
        <Route path="bookings" element={<BookingCalendarPage />} />
        <Route path="commissions" element={<OperatorCommissionsPage />} />
        <Route path="activity" element={<ActivityTimelinePage />} />
        <Route path="studios" element={<StudiosPage />} />
        <Route path="services" element={<ServicesPricingPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="profile" element={<SessionSecurityProfilePage />} />
        <Route path="*" element={<Navigate to="/operator" replace />} />
      </Route>
    </Routes>
  );
}
