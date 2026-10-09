import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';

// Renders the current path so tests can assert on navigation
export function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

export function renderWithRouter(ui: ReactNode, { route = '/', path = '/' }: { route?: string; path?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

export function loginAs(user: { id?: string; email: string }) {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('access_token', 'access-token');
  localStorage.setItem('refresh_token', 'refresh-token');
}
