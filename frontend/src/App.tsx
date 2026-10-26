import { useEffect } from 'react';
import { AppSidebar } from './components/layout/AppSidebar';
import { ToastContainer } from './components/ui/Toast';
import { ChatsView } from './views/ChatsView';
import { ConnectionView } from './views/ConnectionView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { DesignSystemView } from './views/DesignSystemView';
import { useUIStore } from './store/useUIStore';

export default function App() {
  const { activeNav, setActiveNav, theme } = useUIStore();

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

  const renderActiveView = () => {
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
        return <ChatsView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app text-text-main font-sans antialiased">
      {/* Slim Sidebar (left on desktop, bottom tab bar on mobile) */}
      <AppSidebar />

      {/* Main Content Area (supports Chats 3-column layout and page shells) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-16 md:pb-0">
        {renderActiveView()}
      </main>

      {/* Toast Notification Container */}
      <ToastContainer />
    </div>
  );
}
