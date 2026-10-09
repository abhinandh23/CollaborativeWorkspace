import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import api, { API_URL } from '../src/api/axios';
import App from '../src/App';
import Navbar from '../src/components/Navbar';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { LocationProbe, loginAs, renderWithRouter } from './utils';

jest.mock('@react-oauth/google', () => ({ GoogleLogin: () => null }));

describe('api client (JWT interceptors)', () => {
  let apiAdapter: jest.Mock<(config: any) => Promise<any>>;
  let refreshAdapter: jest.Mock<(config: any) => Promise<any>>;

  const ok = (config: any, data: any = {}) => Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
  const unauthorized = (config: any) => Promise.reject({ config, response: { status: 401 } });

  beforeEach(() => {
    // Replace the network layer so no real HTTP requests are made
    apiAdapter = jest.fn();
    refreshAdapter = jest.fn();
    api.defaults.adapter = apiAdapter as any;
    axios.defaults.adapter = refreshAdapter as any;
  });

  it('points at the local backend by default', () => {
    expect(API_URL).toBe('http://localhost:8001/api');
  });

  it('attaches the stored access token as a Bearer header', async () => {
    localStorage.setItem('access_token', 'tok-123');
    apiAdapter.mockImplementation((config) => ok(config));

    await api.get('/workspaces/');

    expect(apiAdapter.mock.calls[0][0].headers.Authorization).toBe('Bearer tok-123');
  });

  it('sends no Authorization header when logged out', async () => {
    apiAdapter.mockImplementation((config) => ok(config));
    await api.get('/workspaces/');
    expect(apiAdapter.mock.calls[0][0].headers.Authorization).toBeUndefined();
  });

  it('refreshes an expired access token and retries the request once', async () => {
    localStorage.setItem('access_token', 'expired');
    localStorage.setItem('refresh_token', 'refresh-1');
    apiAdapter
      .mockImplementationOnce(unauthorized)
      .mockImplementationOnce((config) => ok(config, ['workspace']));
    refreshAdapter.mockImplementation((config) => ok(config, { access: 'fresh' }));

    const res = await api.get('/workspaces/');

    expect(res.data).toEqual(['workspace']);
    const refreshCall = refreshAdapter.mock.calls[0][0];
    expect(refreshCall.url).toBe(`${API_URL}/users/login/refresh/`);
    expect(JSON.parse(refreshCall.data)).toEqual({ refresh: 'refresh-1' });
    expect(localStorage.getItem('access_token')).toBe('fresh');
    expect(apiAdapter.mock.calls[1][0].headers.Authorization).toBe('Bearer fresh');
  });

  it('logs the user out when the refresh token is also rejected', async () => {
    localStorage.setItem('access_token', 'expired');
    localStorage.setItem('refresh_token', 'expired-too');
    localStorage.setItem('user', '{"email":"a@b.c"}');
    apiAdapter.mockImplementation(unauthorized);
    refreshAdapter.mockImplementation((config) => Promise.reject({ config, response: { status: 401 } }));
    jest.spyOn(console, 'error').mockImplementation(() => {}); // jsdom logs the unsupported redirect

    await expect(api.get('/workspaces/')).rejects.toBeTruthy();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('passes a 401 through when there is no refresh token', async () => {
    apiAdapter.mockImplementation(unauthorized);
    await expect(api.get('/workspaces/')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshAdapter).not.toHaveBeenCalled();
  });

  it('does not refresh on other errors', async () => {
    localStorage.setItem('refresh_token', 'r');
    apiAdapter.mockImplementation((config) => Promise.reject({ config, response: { status: 500 } }));
    await expect(api.get('/x')).rejects.toMatchObject({ response: { status: 500 } });
    expect(refreshAdapter).not.toHaveBeenCalled();
  });
});

describe('AuthContext', () => {
  function Probe() {
    const { user, login, logout } = useAuth();
    return (
      <div>
        <span data-testid="user">{user ? user.email : 'none'}</span>
        <button onClick={() => login('a', 'r', { email: 'z@z.z' })}>login</button>
        <button onClick={logout}>logout</button>
      </div>
    );
  }

  // Rendered outside <Routes> so the probe stays mounted after navigation
  function renderProbe(route = '/') {
    return render(
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <Probe />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('restores the user from localStorage on load', () => {
    loginAs({ email: 'saved@example.com' });
    renderProbe();
    expect(screen.getByTestId('user')).toHaveTextContent('saved@example.com');
  });

  it('logout clears tokens and returns to login', async () => {
    loginAs({ email: 'saved@example.com' });
    renderProbe('/dashboard');

    await userEvent.click(screen.getByText('logout'));

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('login stores tokens and opens the dashboard', async () => {
    renderProbe();
    await userEvent.click(screen.getByText('login'));
    expect(screen.getByTestId('user')).toHaveTextContent('z@z.z');
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('throws when used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within an AuthProvider');
  });
});

describe('Navbar', () => {
  it('is hidden when logged out', () => {
    renderWithRouter(<Navbar />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows the user and logs out from the dropdown', async () => {
    loginAs({ email: 'alice@example.com' });
    renderWithRouter(<Navbar />, { route: '/dashboard', path: '/dashboard' });

    expect(screen.getByText('A')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /alice@example.com/ }));
    expect(screen.getByText('Signed in as')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('App routing', () => {
  it('redirects / to the login page', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByText('Welcome Back')).toBeInTheDocument();
  });
});
