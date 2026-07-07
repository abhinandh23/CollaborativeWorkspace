import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [joinWorkspaceId, setJoinWorkspaceId] = useState('');
  const [joinError, setJoinError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const response = await api.get('/workspaces/');
      setWorkspaces(response.data);
    } catch (error) {
      console.error("Error fetching workspaces", error);
    }
  };

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    
    try {
      const response = await api.post('/workspaces/', { name: newWorkspaceName });
      setWorkspaces([...workspaces, response.data]);
      setNewWorkspaceName('');
    } catch (error) {
      console.error("Error creating workspace", error);
    }
  };

  const joinWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError('');
    if (!joinWorkspaceId.trim()) return;
    
    try {
      const response = await api.post('/workspaces/join/', { workspace_id: joinWorkspaceId.trim() });
      navigate(`/workspace/${response.data.id}`);
    } catch (error: any) {
      setJoinError(error.response?.data?.error || "Failed to join workspace.");
    }
  };

  return (
    <div className="w-full max-w-4xl p-8">
      <h1 className="text-3xl font-bold mb-8">Your Workspaces</h1>
      
      <div className="flex flex-col md:flex-row gap-8 mb-8">
        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-4">Create New</h2>
          <form onSubmit={createWorkspace} className="flex gap-4">
            <Input 
              placeholder="Workspace Name..." 
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit">Create</Button>
          </form>
        </div>

        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-4">Join Existing</h2>
          <form onSubmit={joinWorkspace} className="flex flex-col gap-2">
            <div className="flex gap-4">
              <Input 
                placeholder="Paste Workspace ID..." 
                value={joinWorkspaceId}
                onChange={(e) => setJoinWorkspaceId(e.target.value)}
                className="max-w-sm"
              />
              <Button type="submit" variant="secondary">Join</Button>
            </div>
            {joinError && <p className="text-red-500 text-sm">{joinError}</p>}
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces.map((workspace) => (
          <Card key={workspace.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate(`/workspace/${workspace.id}`)}>
            <CardHeader>
              <CardTitle>{workspace.name}</CardTitle>
              <CardDescription>Created on {new Date(workspace.created_at).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button variant="secondary" className="w-full">Enter Workspace</Button>
            </CardFooter>
          </Card>
        ))}
        {workspaces.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-12">
            No workspaces yet. Create one above!
          </div>
        )}
      </div>
    </div>
  );
}
