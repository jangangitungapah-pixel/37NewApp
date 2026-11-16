import { Calendar, Coins, DoorOpen, Layers, LayoutDashboard, Shield, Users } from 'lucide-react';

export const OPERATOR_NAV_ITEMS = [
  { to: '/operator', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/operator/bookings', label: 'Kalender & Booking', icon: Calendar, end: false },
  { to: '/operator/commissions', label: 'Komisi Saya', icon: Coins, end: false },
  { to: '/operator/studios', label: 'Studio Ditugaskan', icon: DoorOpen, end: false },
  { to: '/operator/services', label: 'Layanan & Tarif', icon: Layers, end: false },
  { to: '/operator/customers', label: 'Customers', icon: Users, end: false },
  { to: '/operator/profile', label: 'Profil & Akses', icon: Shield, end: false },
];
