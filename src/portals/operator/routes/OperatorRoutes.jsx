import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLES } from '../../../domain/enums/roles.js';
import { lazyNamed } from '../../../app/router/lazyNamed.js';
import { RouteSuspense } from '../../../app/router/RouteSuspense.jsx';
import { DashboardOverviewPage } from '../../../features/dashboard/DashboardOverviewPage.jsx';
import { OperatorLayout } from '../layout/OperatorLayout.jsx';

const BookingCalendarPage = lazyNamed(
  () => import('../../../features/bookings/BookingCalendarPage.jsx'),
  'BookingCalendarPage',
);
const OperatorCommissionsPage = lazyNamed(
  () => import('../../../features/finance/OperatorCommissionsPage.jsx'),
  'OperatorCommissionsPage',
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

export function OperatorRoutes() {
  return (
    <Routes>
      <Route element={<OperatorLayout />}>
        <Route index element={<DashboardOverviewPage portalRole={ROLES.OPERATOR} />} />
        <Route path="bookings" element={lazyElement(BookingCalendarPage, 'Memuat kalender booking...')} />
        <Route path="commissions" element={lazyElement(OperatorCommissionsPage, 'Memuat komisi operator...')} />
        <Route path="activity" element={lazyElement(ActivityTimelinePage, 'Memuat aktivitas studio...')} />
        <Route path="gallery" element={lazyElement(GalleryPage, 'Memuat galeri studio...')} />
        <Route path="studios" element={lazyElement(StudiosPage, 'Memuat studio ditugaskan...')} />
        <Route path="services" element={lazyElement(ServicesPricingPage, 'Memuat layanan & tarif...')} />
        <Route path="customers" element={lazyElement(CustomersPage, 'Memuat customer...')} />
        <Route path="profile" element={lazyElement(SessionSecurityProfilePage, 'Memuat profil & akses...')} />
        <Route path="*" element={<Navigate to="/operator" replace />} />
      </Route>
    </Routes>
  );
}
