import { PortalShell } from '../../../app/layouts/PortalShell.jsx';
import { OPERATOR_NAV_ITEMS } from '../navigation/operatorNav.js';

export function OperatorLayout() {
  return (
    <PortalShell
      portalLabel="Operator Portal"
      portalBadgeVariant="success"
      navItems={OPERATOR_NAV_ITEMS}
    />
  );
}
