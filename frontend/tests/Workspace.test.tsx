import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../src/api/axios';
import Workspace from '../src/pages/Workspace';
import { loginAs, renderWithRouter } from './utils';

jest.mock('../src/api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

// Monaco needs a real browser; a textarea exposes the same value/onChange/language contract
jest.mock('@monaco-editor/react', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ value, onChange, language }: any) =>
      React.createElement('textarea', {
        'data-testid': 'editor',
        'data-language': language,
        value,
        onChange: (e: any) => onChange(e.target.value),
      }),
  };
});

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  // Test helpers
  open() {
    this.readyState = MockWebSocket.OPEN;
    act(() => this.onopen?.());
  }

  receive(data: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(data) }));
  }

  drop() {
    this.readyState = MockWebSocket.CLOSED;
    act(() => this.onclose?.());
  }
}

const mockedGet = api.get as jest.MockedFunction<typeof api.get>;
const mockedPost = api.post as jest.MockedFunction<typeof api.post>;
const mockedPatch = api.patch as jest.MockedFunction<typeof api.patch>;

const USER = { id: 'user-1', email: 'alice@example.com' };
let files: { id: string; name: string; content: string }[];

function latestSocket() {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

async function renderWorkspace() {
  renderWithRouter(<Workspace />, { route: '/workspace/ws-1', path: '/workspace/:id' });
  await screen.findByText('Team Project');
  await waitFor(() => expect(screen.getByTestId('editor')).toHaveValue('print("hello")'));
  // Selecting the first file re-runs the connection effect, so talk to the newest socket
  const socket = latestSocket();
  socket.open();
  return socket;
}

beforeEach(() => {
  jest.clearAllMocks();
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket;
  jest.spyOn(console, 'log').mockImplementation(() => {});
  loginAs(USER);
  files = [
    { id: 'f-py', name: 'main.py', content: 'print("hello")' },
    { id: 'f-js', name: 'app.js', content: 'console.log(1)' },
  ];
  mockedGet.mockImplementation(async (url: string) => {
    if (url === '/workspaces/ws-1/') return { data: { id: 'ws-1', name: 'Team Project' } };
    if (url === '/workspaces/files/?workspace=ws-1') return { data: files };
    if (url === '/workspaces/ws-1/messages/') return { data: [{ sender_email: 'bob@example.com', content: 'hi from history' }] };
    throw new Error(`unexpected GET ${url}`);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('loading', () => {
  it('shows the workspace name, files, chat history and first file in the editor', async () => {
    await renderWorkspace();

    expect(screen.getByText('📄 main.py')).toBeInTheDocument();
    expect(screen.getByText('📄 app.js')).toBeInTheDocument();
    expect(screen.getByText('hi from history')).toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveAttribute('data-language', 'python');
    expect(screen.getByText('ID: ws-1')).toBeInTheDocument();
  });

  it('connects to the workspace WebSocket', async () => {
    const socket = await renderWorkspace();
    expect(socket.url).toBe('ws://localhost:8001/ws/workspace/ws-1/');
  });

  it('switches files and editor language', async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByText('📄 app.js'));

    expect(screen.getByTestId('editor')).toHaveValue('console.log(1)');
    expect(screen.getByTestId('editor')).toHaveAttribute('data-language', 'javascript');
  });
});

describe('real-time code sync', () => {
  it('sends each edit as a code_update for the active file', async () => {
    const socket = await renderWorkspace();

    await userEvent.type(screen.getByTestId('editor'), '!');

    expect(socket.sent).toContainEqual({ type: 'code_update', file_id: 'f-py', code: 'print("hello")!' });
    expect(screen.getByTestId('editor')).toHaveValue('print("hello")!');
  });

  it('does not send while the socket is not open', async () => {
    const socket = await renderWorkspace();
    socket.readyState = MockWebSocket.CONNECTING;

    await userEvent.type(screen.getByTestId('editor'), 'x');

    expect(socket.sent).toEqual([]);
    expect(screen.getByTestId('editor')).toHaveValue('print("hello")x');
  });

  it('applies code updates from other users to the matching file', async () => {
    const socket = await renderWorkspace();

    socket.receive({ type: 'code_update', file_id: 'f-py', code: 'print("from bob")' });
    expect(screen.getByTestId('editor')).toHaveValue('print("from bob")');

    socket.receive({ type: 'code_update', file_id: 'f-js', code: 'console.log("bob")' });
    expect(screen.getByTestId('editor')).toHaveValue('print("from bob")');
  });

  // Known bug: fetchFiles depends on activeFileId, so switching files re-runs the load effect,
  // re-fetches every file from the server (dropping unsaved/live edits) and reconnects the socket.
  it.failing('keeps live edits to other files when switching to them', async () => {
    const socket = await renderWorkspace();

    socket.receive({ type: 'code_update', file_id: 'f-js', code: 'console.log("bob")' });
    await userEvent.click(screen.getByText('📄 app.js'));

    // Let any re-fetch triggered by the switch resolve before checking
    await act(async () => {});
    await act(async () => {});
    expect(screen.getByTestId('editor')).toHaveValue('console.log("bob")');
  });

  it('refreshes the file list when another user creates a file', async () => {
    const socket = await renderWorkspace();
    files = [...files, { id: 'f-new', name: 'utils.cpp', content: '' }];

    socket.receive({ type: 'file_event', action: 'create', file_id: 'f-new' });

    expect(await screen.findByText('📄 utils.cpp')).toBeInTheDocument();
  });
});

describe('connection lifecycle', () => {
  it('reconnects 3 seconds after the connection drops', async () => {
    const socket = await renderWorkspace();
    jest.useFakeTimers();
    const count = MockWebSocket.instances.length;

    socket.drop();
    act(() => jest.advanceTimersByTime(2999));
    expect(MockWebSocket.instances).toHaveLength(count);
    act(() => jest.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(count + 1);
    expect(latestSocket().url).toBe('ws://localhost:8001/ws/workspace/ws-1/');
  });

  it('closes the socket without reconnecting when leaving the page', async () => {
    const { unmount } = renderWithRouter(<Workspace />, { route: '/workspace/ws-1', path: '/workspace/:id' });
    await screen.findByText('Team Project');
    const socket = latestSocket();
    jest.useFakeTimers();

    unmount();

    expect(socket.close).toHaveBeenCalled();
    expect(socket.onclose).toBeNull();
    const count = MockWebSocket.instances.length;
    act(() => jest.advanceTimersByTime(5000));
    expect(MockWebSocket.instances).toHaveLength(count);
  });
});

describe('chat', () => {
  it('sends chat messages with the sender and clears the input', async () => {
    const socket = await renderWorkspace();
    const input = screen.getByPlaceholderText('Type a message...');

    await userEvent.type(input, 'ready to pair?');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(socket.sent).toContainEqual({
      type: 'chat_message', content: 'ready to pair?', sender_id: 'user-1', sender_email: 'alice@example.com',
    });
    expect(input).toHaveValue('');
  });

  it('does not send blank messages', async () => {
    const socket = await renderWorkspace();
    await userEvent.type(screen.getByPlaceholderText('Type a message...'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(socket.sent).toEqual([]);
  });

  it('shows incoming messages', async () => {
    const socket = await renderWorkspace();
    socket.receive({ type: 'chat_message', content: 'pushed a fix', sender_email: 'bob@example.com' });
    expect(screen.getByText('pushed a fix')).toBeInTheDocument();
  });
});

describe('running and saving code', () => {
  it('runs the active file and shows stdout', async () => {
    mockedPost.mockResolvedValueOnce({ data: { stdout: 'hello\n', stderr: '' } });
    await renderWorkspace();

    await userEvent.click(screen.getByRole('button', { name: 'Run Code ▶' }));

    expect(mockedPost).toHaveBeenCalledWith('/workspaces/execute/', { code: 'print("hello")', filename: 'main.py' });
    expect(await screen.findByText('hello')).toBeInTheDocument();
  });

  it('shows stderr when there is no stdout', async () => {
    mockedPost.mockResolvedValueOnce({ data: { stdout: '', stderr: 'SyntaxError' } });
    await renderWorkspace();
    await userEvent.click(screen.getByRole('button', { name: 'Run Code ▶' }));
    expect(await screen.findByText('SyntaxError')).toBeInTheDocument();
  });

  it('shows the server’s error when execution is unavailable', async () => {
    mockedPost.mockRejectedValueOnce({
      message: 'Request failed with status code 503',
      response: { data: { error: 'Code execution is unavailable: Docker is not installed on this server.' } },
    });
    await renderWorkspace();

    await userEvent.click(screen.getByRole('button', { name: 'Run Code ▶' }));

    expect(await screen.findByText(/Docker is not installed on this server/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run Code ▶' })).toBeEnabled();
  });

  it('saves the active file’s current content', async () => {
    mockedPatch.mockResolvedValueOnce({ data: {} });
    await renderWorkspace();
    await userEvent.type(screen.getByTestId('editor'), '#');

    await userEvent.click(screen.getByRole('button', { name: 'Save Code' }));

    expect(mockedPatch).toHaveBeenCalledWith('/workspaces/files/f-py/', { content: 'print("hello")#' });
    expect(await screen.findByRole('button', { name: 'Saved! ✓' })).toBeInTheDocument();
  });

  it('alerts when saving fails', async () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedPatch.mockRejectedValueOnce({ response: { status: 403, data: { detail: 'nope' } } });
    await renderWorkspace();

    await userEvent.click(screen.getByRole('button', { name: 'Save Code' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Failed to save code. HTTP 403: {"detail":"nope"}'));
  });
});

describe('creating files', () => {
  it('creates a file with the chosen extension, opens it and notifies others', async () => {
    const created = { id: 'f-new', name: 'server.js', content: '' };
    mockedPost.mockImplementationOnce(async () => {
      files = [...files, created]; // the server now has it, so later re-fetches include it
      return { data: created };
    });
    await renderWorkspace();

    await userEvent.click(screen.getByTitle('New File'));
    await userEvent.type(screen.getByPlaceholderText('filename'), 'server');
    await userEvent.selectOptions(screen.getByRole('combobox'), '.js');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockedPost).toHaveBeenCalledWith('/workspaces/files/', { workspace: 'ws-1', name: 'server.js', content: '' });
    expect(await screen.findByText('📄 server.js')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('editor')).toHaveAttribute('data-language', 'javascript'));
    expect(MockWebSocket.instances.some((s) =>
      s.sent.some((m) => m.type === 'file_event' && m.action === 'create' && m.file_id === 'f-new'),
    )).toBe(true);
  });

  it('keeps an explicit extension typed by the user', async () => {
    mockedPost.mockResolvedValueOnce({ data: { id: 'f-new', name: 'algo.cpp', content: '' } });
    await renderWorkspace();

    await userEvent.click(screen.getByTitle('New File'));
    await userEvent.type(screen.getByPlaceholderText('filename'), 'algo.cpp');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(mockedPost).toHaveBeenCalledWith('/workspaces/files/', expect.objectContaining({ name: 'algo.cpp' }));
  });

  it('alerts when the file cannot be created', async () => {
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedPost.mockRejectedValueOnce(new Error('400'));
    await renderWorkspace();

    await userEvent.click(screen.getByTitle('New File'));
    await userEvent.type(screen.getByPlaceholderText('filename'), 'dup');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Failed to create file'));
  });
});

it('copies the workspace ID to the clipboard', async () => {
  await renderWorkspace();
  const user = userEvent.setup();
  const writeText = jest.spyOn(navigator.clipboard, 'writeText');

  await user.click(screen.getByTitle('Click to copy Workspace ID'));

  expect(writeText).toHaveBeenCalledWith('ws-1');
  expect(screen.getByText('Copied!')).toBeInTheDocument();
});
