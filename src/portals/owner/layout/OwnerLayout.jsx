import { PortalShell } from '../../../app/layouts/PortalShell.jsx';
import { OWNER_NAV_ITEMS } from '../navigation/ownerNav.js';

export function OwnerLayout() {
  return (
    <PortalShell
      portalLabel="Owner Portal"
      portalBadgeVariant="warning"
      navItems={OWNER_NAV_ITEMS}
    />
  );
}
