import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { lazyNamed } from '../../../app/router/lazyNamed.js';
import { RouteSuspense } from '../../../app/router/RouteSuspense.jsx';
import { PhaseFoundationDashboard } from '../../../features/dashboard/PhaseFoundationDashboard.jsx';
import { OwnerLayout } from '../layout/OwnerLayout.jsx';

const BookingCalendarPage = lazyNamed(
  () => import('../../../features/bookings/BookingCalendarPage.jsx'),
  'BookingCalendarPage',
);
const FinanceSettlementPage = lazyNamed(
  () => import('../../../features/finance/FinanceSettlementPage.jsx'),
  'FinanceSettlementPage',
);
const ActivityTimelinePage = lazyNamed(
  () => import('../../../features/notifications/ActivityTimelinePage.jsx'),
  'ActivityTimelinePage',
);
const GalleryPage = lazyNamed(
  () => import('../../../features/gallery/GalleryPage.jsx'),
  'GalleryPage',
);
const StudiosPage = lazyNamed(
  () => import('../../../features/studios/StudiosPage.jsx'),
  'StudiosPage',
);
const ServicesPricingPage = lazyNamed(
  () => import('../../../features/services/ServicesPricingPage.jsx'),
  'ServicesPricingPage',
);
const CustomersPage = lazyNamed(
  () => import('../../../features/customers/CustomersPage.jsx'),
  'CustomersPage',
);
const TeamManagementPage = lazyNamed(
  () => import('../../../features/team/TeamManagementPage.jsx'),
  'TeamManagementPage',
);
const BusinessSettingsPage = lazyNamed(
  () => import('../../../features/settings/BusinessSettingsPage.jsx'),
  'BusinessSettingsPage',
);
const SessionSecurityProfilePage = lazyNamed(
  () => import('../../../features/dashboard/SessionSecurityProfilePage.jsx'),
  'SessionSecurityProfilePage',
);

function lazyElement(Component, label) {
  return (
    <RouteSuspense label={label}>
      <Component />
    </RouteSuspense>
  );
}

export function OwnerRoutes() {
  return (
    <Routes>
      <Route element={<OwnerLayout />}>
        <Route index element={<PhaseFoundationDashboard portalRole={ROLES.OWNER} />} />
        <Route path="bookings" element={lazyElement(BookingCalendarPage, 'Memuat kalender booking...')} />
        <Route path="finance" element={lazyElement(FinanceSettlementPage, 'Memuat settlement & ledger...')} />
        <Route path="activity" element={lazyElement(ActivityTimelinePage, 'Memuat aktivitas bisnis...')} />
        <Route path="gallery" element={lazyElement(GalleryPage, 'Memuat galeri studio...')} />
        <Route path="studios" element={lazyElement(StudiosPage, 'Memuat data studio...')} />
        <Route path="services" element={lazyElement(ServicesPricingPage, 'Memuat layanan & tarif...')} />
        <Route path="customers" element={lazyElement(CustomersPage, 'Memuat daftar customer...')} />
        <Route path="team" element={lazyElement(TeamManagementPage, 'Memuat manajemen tim...')} />
        <Route path="settings" element={lazyElement(BusinessSettingsPage, 'Memuat pengaturan bisnis...')} />
        <Route path="profile" element={lazyElement(SessionSecurityProfilePage, 'Memuat keamanan sesi...')} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
}
