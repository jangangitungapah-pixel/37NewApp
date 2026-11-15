import { LayoutDashboard, Shield } from 'lucide-react';

export const OWNER_NAV_ITEMS = [
  { to: '/owner', label: 'Foundation Overview', icon: LayoutDashboard, end: true },
  { to: '/owner/profile', label: 'Keamanan & Sesi', icon: Shield, end: false },
];
