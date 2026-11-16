import {
  Calendar,
  DoorOpen,
  Layers,
  LayoutDashboard,
  Settings,
  Shield,
  Users,
  Users2,
} from 'lucide-react';

export const OWNER_NAV_ITEMS = [
  { to: '/owner', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/owner/bookings', label: 'Bookings & Calendar', icon: Calendar, end: false },
  { to: '/owner/studios', label: 'Studios & Rooms', icon: DoorOpen, end: false },
  { to: '/owner/services', label: 'Services & Pricing', icon: Layers, end: false },
  { to: '/owner/customers', label: 'Customers', icon: Users, end: false },
  { to: '/owner/team', label: 'Team & Access', icon: Users2, end: false },
  { to: '/owner/settings', label: 'Settings & Policies', icon: Settings, end: false },
  { to: '/owner/profile', label: 'Keamanan & Sesi', icon: Shield, end: false },
];
