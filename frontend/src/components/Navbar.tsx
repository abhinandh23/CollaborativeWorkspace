import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // If user is not logged in, don't show the navbar (or show a simplified version)
  if (!user) return null;

  return (
    <nav className="w-full border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
        
        {/* Left Side: Brand and Navigation */}
        <div className="flex items-center gap-8">
          <div className="font-bold text-lg tracking-tight text-primary">
            CollabWorkspace
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/dashboard" className="hover:text-foreground transition-colors">Workspaces</Link>
          </div>
        </div>

        {/* Right Side: Profile & Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 hover:bg-muted/50 py-1.5 px-3 rounded-md transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium">{user.email}</span>
          </button>

          {/* Custom Tailwind Dropdown */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-md shadow-lg py-1 z-50">
              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                Signed in as<br/>
                <span className="font-semibold text-foreground truncate block">{user.email}</span>
              </div>
              <button 
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-muted/50 transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
