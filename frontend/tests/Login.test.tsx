import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../src/api/axios';
import Login from '../src/pages/Login';
import Register from '../src/pages/Register';
import { renderWithRouter } from './utils';

jest.mock('../src/api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// The real button loads Google's script; this stand-in lets tests trigger both callbacks
jest.mock('@react-oauth/google', () => {
  const React = require('react');
  return {
    GoogleLogin: ({ onSuccess, onError }: any) =>
      React.createElement(React.Fragment, null,
        React.createElement('button', { type: 'button', onClick: () => onSuccess({ credential: 'google-id-token' }) }, 'Sign in with Google'),
        React.createElement('button', { type: 'button', onClick: () => onError() }, 'Google popup fails'),
      ),
  };
});

const mockedPost = api.post as jest.MockedFunction<typeof api.post>;

beforeEach(() => {
  jest.clearAllMocks();
});

async function fillCredentials(email = 'alice@example.com', password = 'secret123') {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
}

describe('Login', () => {
  it('logs in with email and password, stores the tokens and opens the dashboard', async () => {
    mockedPost.mockResolvedValueOnce({ data: { access: 'acc', refresh: 'ref' } });
    renderWithRouter(<Login />, { route: '/login', path: '/login' });

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(mockedPost).toHaveBeenCalledWith('/users/login/', { email: 'alice@example.com', password: 'secret123' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(localStorage.getItem('access_token')).toBe('acc');
    expect(localStorage.getItem('refresh_token')).toBe('ref');
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual({ email: 'alice@example.com' });
  });

  it('shows the server error message on bad credentials', async () => {
    mockedPost.mockRejectedValueOnce({ response: { data: { detail: 'No active account found with the given credentials' } } });
    renderWithRouter(<Login />, { route: '/login', path: '/login' });

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('No active account found with the given credentials')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('falls back to a generic message when the server gives no detail', async () => {
    mockedPost.mockRejectedValueOnce(new Error('Network Error'));
    renderWithRouter(<Login />, { route: '/login', path: '/login' });

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Login failed. Please check your credentials.')).toBeInTheDocument();
  });

  it('does not submit when required fields are empty', async () => {
    renderWithRouter(<Login />, { route: '/login', path: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('exchanges a Google credential for app tokens', async () => {
    const user = { id: 'u1', email: 'gina@gmail.com' };
    mockedPost.mockResolvedValueOnce({ data: { access: 'g-acc', refresh: 'g-ref', user } });
    renderWithRouter(<Login />, { route: '/login', path: '/login' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(mockedPost).toHaveBeenCalledWith('/users/google/', { credential: 'google-id-token' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(JSON.parse(localStorage.getItem('user')!)).toEqual(user);
  });

  it('shows the backend error when Google login is rejected', async () => {
    mockedPost.mockRejectedValueOnce({ response: { data: { error: 'Invalid token: expired' } } });
    renderWithRouter(<Login />, { route: '/login', path: '/login' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(await screen.findByText('Invalid token: expired')).toBeInTheDocument();
  });

  it('shows an error when the Google popup fails', async () => {
    renderWithRouter(<Login />, { route: '/login', path: '/login' });
    await userEvent.click(screen.getByRole('button', { name: 'Google popup fails' }));
    expect(screen.getByText('Google login failed.')).toBeInTheDocument();
  });

  it('links to the register page', () => {
    renderWithRouter(<Login />, { route: '/login', path: '/login' });
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
  });
});

describe('Register', () => {
  it('creates the account and sends the user to login', async () => {
    mockedPost.mockResolvedValueOnce({ data: {} });
    renderWithRouter(<Register />, { route: '/register', path: '/register' });

    await fillCredentials('new@example.com', 'pw123456');
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(mockedPost).toHaveBeenCalledWith('/users/register/', { email: 'new@example.com', password: 'pw123456' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
  });

  it('shows an error when registration fails', async () => {
    mockedPost.mockRejectedValueOnce({ response: { status: 400 } });
    renderWithRouter(<Register />, { route: '/register', path: '/register' });

    await fillCredentials();
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('Registration failed. Email might already exist.')).toBeInTheDocument();
  });

  it('supports signing up with Google', async () => {
    mockedPost.mockResolvedValueOnce({ data: { access: 'a', refresh: 'r', user: { email: 'g@gmail.com' } } });
    renderWithRouter(<Register />, { route: '/register', path: '/register' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
  });

  it('reports Google sign-up errors', async () => {
    mockedPost.mockRejectedValueOnce(new Error('boom'));
    renderWithRouter(<Register />, { route: '/register', path: '/register' });

    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(await screen.findByText('Google login failed.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Google popup fails' }));
    expect(screen.getByText('Google registration failed.')).toBeInTheDocument();
  });
});
