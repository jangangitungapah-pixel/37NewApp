import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary.jsx';
import { AuthSessionProvider } from '../providers/AuthSessionProvider.jsx';
import { AppRouter } from '../router/AppRouter.jsx';

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthSessionProvider>
          <AppRouter />
        </AuthSessionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
