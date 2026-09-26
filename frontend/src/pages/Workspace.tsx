import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { useAuth } from '../context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import api from '../api/axios';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001';

interface ChatMessage {
  sender_email: string;
  content: string;
}

interface WorkspaceFile {
  id: string;
  name: string;
  content: string;
}

export default function Workspace() {
  const { id } = useParams();
  const { user } = useAuth();
  
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileExt, setNewFileExt] = useState('.py');

  const getLanguageFromFilename = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return 'python';
      case 'js': return 'javascript';
      case 'ts': return 'typescript';
      case 'cpp': return 'cpp';
      case 'c': return 'c';
      case 'java': return 'java';
      default: return 'plaintext';
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [workspaceName, setWorkspaceName] = useState<string>('');
  
  const [copiedId, setCopiedId] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const filesRes = await api.get(`/workspaces/files/?workspace=${id}`);
      setFiles(filesRes.data);
      if (filesRes.data.length > 0 && !activeFileId) {
        setActiveFileId(filesRes.data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  }, [id, activeFileId]);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const res = await api.get(`/workspaces/${id}/`);
        setWorkspaceName(res.data.name);
        
        await fetchFiles();

        const messagesRes = await api.get(`/workspaces/${id}/messages/`);
        setMessages(messagesRes.data);
      } catch (err) {
        console.error("Failed to fetch workspace details", err);
      }
    };
    fetchWorkspace();
  }, [id, fetchFiles]);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    
    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/ws/workspace/${id}/`);
      wsRef.current = ws;

      ws.onopen = () => console.log('Connected to workspace websocket');

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'code_update') {
          setFiles((prevFiles) => 
            prevFiles.map(f => f.id === data.file_id ? { ...f, content: data.code } : f)
          );
        } else if (data.type === 'chat_message') {
          setMessages((prev) => [...prev, { sender_email: data.sender_email || 'User', content: data.content }]);
        } else if (data.type === 'file_event') {
          fetchFiles();
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
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [id, fetchFiles]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && activeFileId) {
      setFiles((prevFiles) => 
        prevFiles.map(f => f.id === activeFileId ? { ...f, content: value } : f)
      );
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'code_update',
          file_id: activeFileId,
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

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    const fullFilename = newFileName.includes('.') ? newFileName : `${newFileName}${newFileExt}`;
    try {
      const res = await api.post('/workspaces/files/', { workspace: id, name: fullFilename, content: '' });
      setFiles(prev => [...prev, res.data]);
      setActiveFileId(res.data.id);
      setIsAddingFile(false);
      setNewFileName('');
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'file_event', action: 'create', file_id: res.data.id }));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to create file');
    }
  };

  const runCode = async () => {
    if (!activeFileId) return;
    setIsExecuting(true);
    setOutput('Running...\n');
    try {
      const currentCode = files.find(f => f.id === activeFileId)?.content || '';
      const res = await api.post('/workspaces/execute/', { 
        code: currentCode,
        filename: activeFile?.name || 'main.py'
      });
      if (res.data.error) {
        setOutput(`Error: ${res.data.error}\n${res.data.stderr || ''}`);
      } else {
        setOutput(res.data.stdout || res.data.stderr || 'Execution finished with no output.');
      }
    } catch (err: any) {
      setOutput(`Failed to execute code.\n${err.response?.data?.error || err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const saveCode = async () => {
    if (!activeFileId) return;
    setIsSaving(true);
    try {
      const currentCode = files.find(f => f.id === activeFileId)?.content || '';
      await api.patch(`/workspaces/files/${activeFileId}/`, { content: currentCode });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (err: any) {
      console.error("Failed to save code", err);
      const msg = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
      alert(`Failed to save code. ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const copyWorkspaceId = () => {
    if (id) {
      navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const activeFile = files.find(f => f.id === activeFileId);
  const activeCode = activeFile?.content || '';

  return (
    <div className="w-full h-screen max-h-screen px-6 py-4 flex flex-col items-center overflow-hidden">
      {/* Workspace Header */}
      <div className="w-full flex justify-between items-end mb-4 px-2 shrink-0">
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

      <div className="flex flex-1 w-full border border-border rounded-xl overflow-hidden shadow-2xl min-h-0">
        {/* Left Sidebar for Files and Chat */}
        <div className="w-72 flex flex-col border-r border-border bg-card shrink-0">
          
          {/* File Explorer (Top half) */}
          <div className="flex-1 flex flex-col min-h-[50%] border-b border-border">
            <div className="p-3 bg-muted/30 flex justify-between items-center border-b border-border shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Files</h2>
              <button 
                onClick={() => setIsAddingFile(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-muted w-6 h-6 rounded flex items-center justify-center transition-colors"
                title="New File"
              >
                +
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {isAddingFile && (
                <form onSubmit={handleCreateFile} className="mb-2 flex gap-1">
                  <Input 
                    autoFocus
                    value={newFileName} 
                    onChange={(e) => setNewFileName(e.target.value)} 
                    placeholder="filename" 
                    className="h-7 text-xs bg-muted/50 border-none flex-1"
                  />
                  <select 
                    value={newFileExt}
                    onChange={(e) => setNewFileExt(e.target.value)}
                    className="h-7 text-xs bg-muted border-none rounded px-1 text-foreground"
                  >
                    <option value=".py">.py (Python)</option>
                    <option value=".js">.js (Node)</option>
                    <option value=".cpp">.cpp (C++)</option>
                  </select>
                  <Button type="submit" size="sm" className="h-7 px-2 text-xs">Add</Button>
                </form>
              )}
              {files.map(file => (
                <div 
                  key={file.id} 
                  onClick={() => setActiveFileId(file.id)}
                  className={`px-2 py-1.5 text-sm cursor-pointer rounded-md mb-1 transition-colors ${file.id === activeFileId ? 'bg-primary/20 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                >
                  📄 {file.name}
                </div>
              ))}
              {files.length === 0 && !isAddingFile && (
                <div className="text-xs text-muted-foreground text-center mt-4">No files yet</div>
              )}
            </div>
          </div>

          {/* Chat (Bottom half) */}
          <div className="flex-1 flex flex-col min-h-[50%]">
            <div className="p-3 bg-muted/30 border-b border-border shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workspace Chat</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-xs text-muted-foreground text-center mt-4">No messages yet. Say hello!</div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground mb-1">{msg.sender_email}</span>
                  <div className="bg-primary/10 text-xs p-2 rounded-md rounded-tl-none self-start break-words max-w-full">
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={sendChatMessage} className="p-2 border-t border-border bg-muted/30 flex gap-2 shrink-0">
              <Input 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
                placeholder="Type a message..." 
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8 text-xs">Send</Button>
            </form>
          </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
          <div className="h-10 bg-[#252526] border-b border-[#3c3c3c] flex items-center justify-between px-4 shrink-0">
            <div className="text-xs text-[#9cdcfe] font-mono">
              {activeFile ? activeFile.name : 'No file selected'}
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-xs border-[#4a4a4a] text-[#cccccc] hover:bg-[#3c3c3c] hover:text-white px-4" 
                onClick={saveCode} 
                disabled={isSaving || !activeFileId}
              >
                {isSaving ? 'Saving...' : (isSaved ? 'Saved! ✓' : 'Save Code')}
              </Button>
              <Button 
                size="sm" 
                variant="secondary" 
                className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white px-4" 
                onClick={runCode} 
                disabled={isExecuting || !activeFileId}
              >
                {isExecuting ? 'Running...' : 'Run Code ▶'}
              </Button>
            </div>
          </div>
          <div className="flex-1 relative min-h-0">
            <Editor
              height="100%"
              language={getLanguageFromFilename(activeFile?.name || '')}
              theme="vs-dark"
              value={activeCode}
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
          <div className="h-48 bg-[#000000] border-t border-[#3c3c3c] p-4 flex flex-col shrink-0">
            <div className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wider flex items-center gap-2">
              Terminal Output
            </div>
            <div className="flex-1 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {output}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
