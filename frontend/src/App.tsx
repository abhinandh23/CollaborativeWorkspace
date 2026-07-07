import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import Navbar from './components/Navbar';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-start justify-center">
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<div className="mt-24"><Login /></div>} />
            <Route path="/register" element={<div className="mt-24"><Register /></div>} />
            <Route path="/dashboard" element={<div className="mt-12 w-full flex justify-center"><Dashboard /></div>} />
            <Route path="/workspace/:id" element={<div className="w-full h-[calc(100vh-3.5rem)]"><Workspace /></div>} />
          </Routes>
        </div>
      </div>
    </AuthProvider>
  );
}

export default App;
