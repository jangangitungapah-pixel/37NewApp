import { LayoutDashboard, Shield } from 'lucide-react';

export const OPERATOR_NAV_ITEMS = [
  { to: '/operator', label: 'Foundation Overview', icon: LayoutDashboard, end: true },
  { to: '/operator/profile', label: 'Keamanan & Sesi', icon: Shield, end: false },
];
