import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../src/api/axios';
import Dashboard from '../src/pages/Dashboard';
import { renderWithRouter } from './utils';

jest.mock('../src/api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

const mockedGet = api.get as jest.MockedFunction<typeof api.get>;
const mockedPost = api.post as jest.MockedFunction<typeof api.post>;

const WORKSPACES = [
  { id: 'ws-1', name: 'Backend API', created_at: '2026-01-15T10:00:00Z' },
  { id: 'ws-2', name: 'Frontend', created_at: '2026-02-01T10:00:00Z' },
];

function renderDashboard() {
  return renderWithRouter(<Dashboard />, { route: '/dashboard', path: '/dashboard' });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockResolvedValue({ data: WORKSPACES });
});

describe('workspace list', () => {
  it('loads and shows the user’s workspaces', async () => {
    renderDashboard();

    expect(await screen.findByText('Backend API')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('/workspaces/');
    expect(screen.getAllByRole('button', { name: 'Enter Workspace' })).toHaveLength(2);
  });

  it('shows an empty state when there are no workspaces', async () => {
    mockedGet.mockResolvedValueOnce({ data: [] });
    renderDashboard();
    expect(await screen.findByText('No workspaces yet. Create one above!')).toBeInTheDocument();
  });

  it('keeps working when the list fails to load', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedGet.mockRejectedValueOnce(new Error('500'));
    renderDashboard();

    expect(await screen.findByText('No workspaces yet. Create one above!')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('opens a workspace when its card is clicked', async () => {
    renderDashboard();
    await userEvent.click(await screen.findByText('Frontend'));
    expect(screen.getByTestId('location')).toHaveTextContent('/workspace/ws-2');
  });
});

describe('workspace creation', () => {
  it('creates a workspace, adds it to the list and clears the input', async () => {
    mockedPost.mockResolvedValueOnce({ data: { id: 'ws-3', name: 'ML Notebook', created_at: '2026-03-01T00:00:00Z' } });
    renderDashboard();
    await screen.findByText('Backend API');

    const input = screen.getByPlaceholderText('Workspace Name...');
    await userEvent.type(input, 'ML Notebook');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockedPost).toHaveBeenCalledWith('/workspaces/', { name: 'ML Notebook' });
    expect(await screen.findByText('ML Notebook')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Enter Workspace' })).toHaveLength(3);
    expect(input).toHaveValue('');
  });

  it('ignores blank names', async () => {
    renderDashboard();
    await screen.findByText('Backend API');

    await userEvent.type(screen.getByPlaceholderText('Workspace Name...'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('keeps the typed name when creation fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedPost.mockRejectedValueOnce(new Error('400'));
    renderDashboard();
    await screen.findByText('Backend API');

    await userEvent.type(screen.getByPlaceholderText('Workspace Name...'), 'Oops');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Workspace Name...')).toHaveValue('Oops');
    expect(screen.getAllByRole('button', { name: 'Enter Workspace' })).toHaveLength(2);
    consoleError.mockRestore();
  });
});

describe('joining a workspace', () => {
  it('joins by ID (trimmed) and opens it', async () => {
    mockedPost.mockResolvedValueOnce({ data: { id: 'ws-9' } });
    renderDashboard();

    await userEvent.type(screen.getByPlaceholderText('Paste Workspace ID...'), '  ws-9  ');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(mockedPost).toHaveBeenCalledWith('/workspaces/join/', { workspace_id: 'ws-9' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/workspace/ws-9'));
  });

  it('shows the server error for an unknown ID', async () => {
    mockedPost.mockRejectedValueOnce({ response: { data: { error: 'Workspace not found or invalid ID' } } });
    renderDashboard();

    await userEvent.type(screen.getByPlaceholderText('Paste Workspace ID...'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Workspace not found or invalid ID')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('shows a generic error when the request fails without details', async () => {
    mockedPost.mockRejectedValueOnce(new Error('Network Error'));
    renderDashboard();

    await userEvent.type(screen.getByPlaceholderText('Paste Workspace ID...'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(await screen.findByText('Failed to join workspace.')).toBeInTheDocument();
  });

  it('ignores an empty ID', async () => {
    renderDashboard();
    await userEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
