import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ROLES } from '../../src/domain/enums/roles.js';

const mockUseAuthSession = vi.fn();

vi.mock('../../src/app/providers/authSessionContext.js', () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

import { RequireActiveRole } from '../../src/app/guards/RouteGuards.jsx';

function renderGuardedRoute({ initialPath }) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>LOGIN_SCREEN</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING_SCREEN</div>} />
        <Route path="/access-denied" element={<div>ACCESS_DENIED_SCREEN</div>} />
        <Route path="/config-error" element={<div>CONFIG_ERROR_SCREEN</div>} />
        <Route element={<RequireActiveRole requiredRole={ROLES.OWNER} />}>
          <Route path="/owner" element={<div>OWNER_PORTAL</div>} />
        </Route>
        <Route element={<RequireActiveRole requiredRole={ROLES.OPERATOR} />}>
          <Route path="/operator" element={<div>OPERATOR_PORTAL</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Portal Route Guards', () => {
  it('redirects unauthenticated visitors to /login', () => {
    mockUseAuthSession.mockReturnValue({ status: 'unauthenticated', member: null });
    renderGuardedRoute({ initialPath: '/owner' });
    expect(screen.getByText('LOGIN_SCREEN')).toBeInTheDocument();
  });

  it('redirects an Operator trying to open /owner to /operator', () => {
    mockUseAuthSession.mockReturnValue({
      status: 'authenticated',
      member: { role: ROLES.OPERATOR, status: 'active' },
    });
    renderGuardedRoute({ initialPath: '/owner' });
    expect(screen.getByText('OPERATOR_PORTAL')).toBeInTheDocument();
  });

  it('allows an active Owner to access /owner', () => {
    mockUseAuthSession.mockReturnValue({
      status: 'authenticated',
      member: { role: ROLES.OWNER, status: 'active' },
    });
    renderGuardedRoute({ initialPath: '/owner' });
    expect(screen.getByText('OWNER_PORTAL')).toBeInTheDocument();
  });

  it('redirects denied/suspended sessions to /access-denied', () => {
    mockUseAuthSession.mockReturnValue({
      status: 'denied',
      member: { role: ROLES.OPERATOR, status: 'suspended' },
    });
    renderGuardedRoute({ initialPath: '/operator' });
    expect(screen.getByText('ACCESS_DENIED_SCREEN')).toBeInTheDocument();
  });
});
