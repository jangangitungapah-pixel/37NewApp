import { Fragment, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils/cn.js';

function formatSegmentLabel(segment) {
  if (!segment) return '';
  return segment
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Generates contextual portal breadcrumbs aligned with active portal navItems and route segments.
 */
export function BreadcrumbTrail({ portalLabel, navItems = [], className }) {
  const { pathname } = useLocation();

  const crumbs = useMemo(() => {
    const cleanPath = pathname.replace(/\/+$/, '') || '/';
    const baseItem = navItems.find((item) => item.end) || navItems[0];
    const items = [];

    if (baseItem) {
      items.push({
        label: portalLabel || 'Portal',
        to: baseItem.to,
      });
    }

    const matchedNav = navItems
      .filter((item) => !item.end && (cleanPath === item.to || cleanPath.startsWith(`${item.to}/`)))
      .sort((a, b) => b.to.length - a.to.length)[0];

    if (matchedNav) {
      items.push({
        label: matchedNav.label,
        to: matchedNav.to,
      });

      const remainder = cleanPath.slice(matchedNav.to.length).split('/').filter(Boolean);
      if (remainder.length > 0) {
        items.push({
          label: formatSegmentLabel(remainder[remainder.length - 1]),
          to: cleanPath,
        });
      }
    } else if (baseItem && cleanPath === baseItem.to) {
      items.push({
        label: baseItem.label,
        to: baseItem.to,
      });
    }

    return items;
  }, [navItems, pathname, portalLabel]);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1.5 text-xs', className)}>
      <ol className="flex items-center gap-1.5 list-none m-0 p-0">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.to}-${index}`}>
              {index > 0 && (
                <li aria-hidden="true" className="text-muted-foreground">
                  <ChevronRight className="size-3.5" />
                </li>
              )}
              <li>
                {isLast ? (
                  <span aria-current="page" className="font-semibold text-foreground">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.to}
                    className="font-medium text-muted-foreground hover:text-foreground no-underline"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
