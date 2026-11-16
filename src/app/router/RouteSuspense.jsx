import { Suspense } from 'react';
import { SessionLoadingSkeleton } from '../../shared/components/StatusFeedback.jsx';

/**
 * Suspense wrapper rendering accessible loading skeleton during route chunk fetch.
 */
export function RouteSuspense({ label = 'Memuat halaman portal...', children }) {
  return <Suspense fallback={<SessionLoadingSkeleton label={label} />}>{children}</Suspense>;
}
