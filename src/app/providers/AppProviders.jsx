import { Tooltip } from '@base-ui/react/tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { appQueryClient } from '../../lib/query/queryClient.js';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary.jsx';
import { AppToaster } from '../../components/feedback/AppToaster.jsx';
import { AuthSessionProvider } from './AuthSessionProvider.jsx';
import { ThemeProvider } from './ThemeProvider.jsx';

/**
 * Root frontend provider composition:
 * ErrorBoundary -> TanStack Query -> Motion (reduced-motion aware) -> Dual Theme ->
 * Base UI Tooltip grouping -> Domain AuthSessionProvider -> Sonner Toaster.
 */
export function AppProviders({ children, queryClient = appQueryClient, includeAuth = true }) {
  const core = (
    <Tooltip.Provider delay={250} closeDelay={120}>
      {children}
      <AppToaster />
    </Tooltip.Provider>
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <ThemeProvider>
            {includeAuth ? <AuthSessionProvider>{core}</AuthSessionProvider> : core}
          </ThemeProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
