import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppSidebar } from './components/layout/AppSidebar';
import { ToastContainer } from './components/ui/Toast';
import { ChatsView } from './views/ChatsView';
import { ConnectionView } from './views/ConnectionView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { DesignSystemView } from './views/DesignSystemView';
import { useUIStore } from './store/useUIStore';
import { api } from './lib/api';
import { getSocket, initSocketListeners } from './lib/socket';

export default function App() {
  const { activeNav, setActiveNav, theme, currentUser, setCurrentUser } = useUIStore();
  const queryClient = useQueryClient();

  // Support direct navigation to /design route via URL path or hash
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.includes('/design') || hash.includes('design')) {
        setActiveNav('design');
      }
    }
  }, [setActiveNav]);

  // Synchronize document root class with stored theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Check authentication status on startup
  useEffect(() => {
    api
      .getMe()
      .then((res) => {
        setCurrentUser(res.user);
        const socket = getSocket();
        socket.connect();
      })
      .catch(() => {
        setCurrentUser(null);
        if (activeNav !== 'design') {
          setActiveNav('login');
        }
      });
  }, [setCurrentUser, setActiveNav, activeNav]);

  // Initialize global Socket.IO event listeners for TanStack Query updates
  useEffect(() => {
    if (currentUser) {
      const cleanup = initSocketListeners(queryClient);
      return cleanup;
    }
  }, [currentUser, queryClient]);

  const renderActiveView = () => {
    // If not logged in and not viewing the design gallery, show Login/Register
    if (!currentUser && activeNav !== 'design') {
      return <LoginView />;
    }

    switch (activeNav) {
      case 'chats':
        return <ChatsView />;
      case 'connection':
        return <ConnectionView />;
      case 'settings':
        return <SettingsView />;
      case 'login':
        return <LoginView />;
      case 'design':
        return <DesignSystemView />;
      default:
        return <ConnectionView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-text-main font-sans antialiased">
      {/* Slim Sidebar (left on desktop, bottom tab bar on mobile) */}
      <AppSidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-16 md:pb-0">
        {renderActiveView()}
      </main>

      {/* Toast Notification Container */}
      <ToastContainer />
    </div>
  );
}
