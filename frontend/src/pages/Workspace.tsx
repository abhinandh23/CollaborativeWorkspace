import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth } from '../context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import api from '../api/axios';

interface ChatMessage {
  sender_email: string;
  content: string;
}

export default function Workspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const [code, setCode] = useState<string>('# Welcome to your collaborative Python workspace\n\ndef hello_world():\n    print("Hello from Collab!")\n\nhello_world()\n');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Fetch workspace details
    const fetchWorkspace = async () => {
      try {
        const res = await api.get(`/workspaces/${id}/`);
        setWorkspaceName(res.data.name);
      } catch (err) {
        console.error("Failed to fetch workspace details", err);
      }
    };
    fetchWorkspace();
  }, [id]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    
    const connect = () => {
      const ws = new WebSocket(`ws://localhost:8001/ws/workspace/${id}/`);
      wsRef.current = ws;

      ws.onopen = () => console.log('Connected to workspace websocket');

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'code_update') {
          setCode((prevCode) => {
            if (prevCode !== data.code) return data.code;
            return prevCode;
          });
        } else if (data.type === 'chat_message') {
          setMessages((prev) => [...prev, { sender_email: data.sender_email || 'User', content: data.content }]);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from workspace websocket. Reconnecting in 3s...');
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        // Prevent onclose from attempting to reconnect after component unmounts
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [id]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'code_update',
          code: value
        }));
      }
    }
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'chat_message',
      content: newMessage,
      sender_id: user?.id,
      sender_email: user?.email
    }));

    setNewMessage('');
  };

  const runCode = async () => {
    setIsExecuting(true);
    setOutput('Running...\n');
    try {
      const res = await api.post('/workspaces/execute/', { code });
      if (res.data.error) {
        setOutput(`Error: ${res.data.error}\n${res.data.stderr || ''}`);
      } else {
        setOutput(res.data.stdout || res.data.stderr || 'Execution finished with no output.');
      }
    } catch (err: any) {
      setOutput(`Failed to execute code.\n${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const copyWorkspaceId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 flex flex-col items-center">
      {/* Workspace Header */}
      <div className="w-full flex justify-between items-end mt-6 mb-2 px-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {workspaceName ? workspaceName : 'Loading Workspace...'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Collaborating in real-time
          </p>
        </div>
        <button 
          onClick={copyWorkspaceId}
          className="group relative text-xs text-muted-foreground font-mono bg-muted/50 hover:bg-muted py-1.5 px-3 rounded cursor-pointer transition-colors flex items-center gap-2"
          title="Click to copy Workspace ID"
        >
          <span>ID: {id}</span>
          {copiedId ? (
            <span className="text-green-500 font-semibold absolute right-3 bg-muted px-1">Copied!</span>
          ) : (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-3 bg-muted px-1 text-foreground">Copy</span>
          )}
        </button>
      </div>

      <div className="flex h-[calc(100vh-12rem)] w-full border border-border rounded-xl overflow-hidden shadow-2xl">
        {/* Sidebar for chat */}
        <div className="w-80 border-r border-border bg-card flex flex-col">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="text-sm font-semibold tracking-tight">Workspace Chat</h2>
          </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground text-center mt-10">No messages yet. Say hello!</div>
          )}
          {messages.map((msg, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-[10px] text-muted-foreground mb-1">{msg.sender_email}</span>
              <div className="bg-primary/10 text-sm p-2 rounded-md rounded-tl-none self-start break-words max-w-full">
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={sendChatMessage} className="p-4 border-t border-border bg-muted/30 flex gap-2">
          <Input 
            value={newMessage} 
            onChange={(e) => setNewMessage(e.target.value)} 
            placeholder="Type a message..." 
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" className="h-9">Send</Button>
        </form>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e]">
        <div className="h-10 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between px-4">
          <div className="text-xs text-[#9cdcfe] font-mono">main.py</div>
          <Button 
            size="sm" 
            variant="secondary" 
            className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white px-4" 
            onClick={runCode} 
            disabled={isExecuting}
          >
            {isExecuting ? 'Running...' : 'Run Code ▶'}
          </Button>
        </div>
        <div className="flex-1 relative">
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              padding: { top: 16 }
            }}
          />
        </div>
        {/* Terminal Area */}
        <div className="h-48 bg-[#000000] border-t border-[#3c3c3c] p-4 flex flex-col">
          <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-2">
            Terminal Output
          </div>
          <div className="flex-1 font-mono text-sm text-green-400 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {output}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
