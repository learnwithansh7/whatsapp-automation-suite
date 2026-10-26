import React from 'react';
import {
  Sun,
  Moon,
  Bell,
  Sliders,
  Check,
  User,
  LogOut,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { useUIStore } from '../store/useUIStore';
import { useToastStore } from '../store/useToastStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { cn } from '../lib/utils';

export const SettingsView: React.FC = () => {
  const { theme, setTheme, currentUser, setCurrentUser, setActiveNav } = useUIStore();
  const { addToast } = useToastStore();
  const [notifications, setNotifications] = React.useState(true);
  const [autoDownload, setAutoDownload] = React.useState(false);

  const handleLogout = async () => {
    try {
      await api.logout();
      setCurrentUser(null);
      getSocket().disconnect();
      addToast({
        title: 'Signed Out',
        message: 'You have been signed out of the dashboard.',
        type: 'info',
      });
      setActiveNav('login');
    } catch {
      setCurrentUser(null);
      setActiveNav('login');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-app flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-main tracking-tight">
            Settings
          </h1>
          <p className="text-xs text-text-muted mt-1">
            Manage your interface appearance, notifications, and client behavior.
          </p>
        </div>

        {/* Appearance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              Appearance & Theme
            </CardTitle>
            <CardDescription>
              Customize how the WhatsApp client looks on your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Light Mode Card */}
              <div
                onClick={() => setTheme('light')}
                className={cn(
                  'relative p-4 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-3 select-none',
                  theme === 'light'
                    ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                    : 'border-border-subtle bg-surface hover:border-border-strong',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-text-main text-sm">
                    <Sun className="w-4 h-4 text-warning" />
                    Clean Light (Default)
                  </div>
                  {theme === 'light' && (
                    <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Crisp borders, airy whites, soft gray surfaces, and comfortable contrast.
                </p>
              </div>

              {/* Dark Mode Card */}
              <div
                onClick={() => setTheme('dark')}
                className={cn(
                  'relative p-4 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-3 select-none',
                  theme === 'dark'
                    ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                    : 'border-border-subtle bg-surface hover:border-border-strong',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-text-main text-sm">
                    <Moon className="w-4 h-4 text-info" />
                    Dark Mode
                  </div>
                  {theme === 'dark' && (
                    <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[2.5]" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Deep dark surfaces with tuned semantic colors for low-light environments.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="w-4 h-4 text-info" />
              Notifications & Sound
            </CardTitle>
            <CardDescription>
              Configure desktop alerts and incoming message notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle/50">
            <div className="py-3 first:pt-0 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-main">Desktop Alerts</p>
                <p className="text-xs text-text-muted">Show notification popup for new messages</p>
              </div>
              <Switch checked={notifications} onChange={setNotifications} />
            </div>

            <div className="py-3 last:pb-0 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-main">Auto-download Media</p>
                <p className="text-xs text-text-muted">Automatically save incoming photos and audio</p>
              </div>
              <Switch checked={autoDownload} onChange={setAutoDownload} />
            </div>
          </CardContent>
        </Card>

        {/* Account Management Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-accent" />
              Account & Authentication
            </CardTitle>
            <CardDescription>
              {import.meta.env.VITE_AUTH_ENABLED === 'true'
                ? `Signed in as ${currentUser?.email || 'admin@local.dev'}`
                : 'Dashboard login bypassed (Supabase auth will replace this later)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-main">
                {import.meta.env.VITE_AUTH_ENABLED === 'true'
                  ? currentUser?.name || 'Admin User'
                  : 'Local Development User'}
              </p>
              <p className="text-xs text-text-muted">
                {import.meta.env.VITE_AUTH_ENABLED === 'true'
                  ? 'Master dashboard account'
                  : 'AUTH_ENABLED=false (Direct Access Active)'}
              </p>
            </div>
            {import.meta.env.VITE_AUTH_ENABLED === 'true' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLogout}
                leftIcon={<LogOut className="w-3.5 h-3.5" />}
              >
                Sign Out
              </Button>
            )}
          </CardContent>
        </Card>

        {/* System & Architecture Info */}
        <Card variant="subtle" className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Environment
            </span>
            <Badge variant="success" size="sm">
              Phase 1 Connect Ready
            </Badge>
          </div>
          <div className="text-xs text-text-secondary flex flex-col gap-1 font-mono">
            <div>Root: D:\whatsapp-client</div>
            <div>Database: PostgreSQL 16 (Native, port 5432)</div>
            <div>Prisma Models: AppUser, Session, AuthKey</div>
            <div>Engine: @whiskeysockets/baileys@6.7.24 (Pinned, Isolated)</div>
          </div>
        </Card>
      </div>
    </div>
  );
};
