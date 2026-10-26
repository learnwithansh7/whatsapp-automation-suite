import React from 'react';
import {
  MessageSquare,
  QrCode,
  Bot,
  Tag,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Palette,
} from 'lucide-react';
import { useUIStore, NavItem } from '../../store/useUIStore';
import { Tooltip } from '../ui/Tooltip';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../lib/utils';

interface NavButtonProps {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({
  label,
  icon,
  active,
  disabled,
  badge,
  onClick,
}) => {
  const button = (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'relative w-11 h-11 rounded-control flex items-center justify-center transition-all duration-fast select-none outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active
          ? 'bg-accent-soft text-accent shadow-subtle'
          : 'text-text-muted hover:text-text-main hover:bg-surface-subtle',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-text-muted',
      )}
    >
      {icon}
      {badge && (
        <span className="absolute -top-1 -right-1 text-[9px] font-bold px-1 py-0.2 rounded bg-surface-subtle border border-border-strong text-text-muted uppercase tracking-tight">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <Tooltip content={disabled ? `${label} (Coming Soon)` : label} position="right">
      {button}
    </Tooltip>
  );
};

export const AppSidebar: React.FC = () => {
  const { activeNav, setActiveNav, theme, toggleTheme, currentUser } = useUIStore();

  const navItems = [
    { id: 'chats' as NavItem, label: 'Chats', icon: <MessageSquare className="w-5 h-5 stroke-[1.75]" /> },
    { id: 'connection' as NavItem, label: 'Connection', icon: <QrCode className="w-5 h-5 stroke-[1.75]" /> },
    {
      id: 'automations' as NavItem,
      label: 'Automations',
      icon: <Bot className="w-5 h-5 stroke-[1.75]" />,
      disabled: true,
      badge: 'Soon',
    },
    {
      id: 'labels' as NavItem,
      label: 'Labels',
      icon: <Tag className="w-5 h-5 stroke-[1.75]" />,
      disabled: true,
      badge: 'Soon',
    },
    {
      id: 'analytics' as NavItem,
      label: 'Analytics',
      icon: <BarChart3 className="w-5 h-5 stroke-[1.75]" />,
      disabled: true,
      badge: 'Soon',
    },
    { id: 'settings' as NavItem, label: 'Settings', icon: <Settings className="w-5 h-5 stroke-[1.75]" /> },
  ];

  return (
    <>
      {/* Desktop Slim Left Sidebar (hidden below md: 768px) */}
      <aside className="hidden md:flex flex-col items-center justify-between w-[68px] shrink-0 bg-surface border-r border-border-subtle py-4 select-none z-20">
        {/* Top Logo */}
        <div className="flex flex-col items-center gap-6 w-full">
          <button
            onClick={() => setActiveNav('chats')}
            className="w-10 h-10 rounded-control bg-accent text-white flex items-center justify-center font-bold text-lg shadow-subtle hover:bg-accent-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="WhatsApp Client Home"
          >
            💬
          </button>

          {/* Navigation Items */}
          <nav className="flex flex-col items-center gap-2.5 w-full">
            {navItems.map((item) => (
              <NavButton
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                active={activeNav === item.id}
                disabled={item.disabled}
                badge={item.badge}
                onClick={() => setActiveNav(item.id)}
              />
            ))}
          </nav>
        </div>

        {/* Bottom Actions: Design System, Theme Toggle, Avatar */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Design System button (hidden dev route shortcut) */}
          <Tooltip content="Design System Preview" position="right">
            <button
              onClick={() => setActiveNav('design')}
              aria-label="Design System Review"
              className={cn(
                'w-10 h-10 rounded-control flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent',
                activeNav === 'design'
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-subtle',
              )}
            >
              <Palette className="w-5 h-5 stroke-[1.75]" />
            </button>
          </Tooltip>

          {/* Theme Toggle Button */}
          <Tooltip
            content={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            position="right"
          >
            <button
              onClick={toggleTheme}
              aria-label="Toggle Color Theme"
              className="w-10 h-10 rounded-control text-text-muted hover:text-text-main hover:bg-surface-subtle flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5 stroke-[1.75]" />
              ) : (
                <Sun className="w-5 h-5 stroke-[1.75]" />
              )}
            </button>
          </Tooltip>

          {/* User Profile Avatar / Local indicator */}
          <Tooltip
            content={
              import.meta.env.VITE_AUTH_ENABLED === 'true'
                ? currentUser
                  ? `Signed in as ${currentUser.name || currentUser.email}`
                  : 'Sign In'
                : 'Local Development Mode'
            }
            position="right"
          >
            <button
              onClick={() => setActiveNav('settings')}
              className="outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full p-0.5"
              aria-label="Account & Settings"
            >
              {import.meta.env.VITE_AUTH_ENABLED === 'true' ? (
                <Avatar
                  name={currentUser?.name || currentUser?.email || 'Admin'}
                  size="sm"
                  status={currentUser ? 'online' : undefined}
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-surface-subtle border border-border-subtle flex items-center justify-center text-[10px] font-bold text-text-secondary select-none shadow-subtle hover:bg-surface hover:text-text-main transition-colors">
                  Local
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      </aside>

      {/* Mobile Bottom Tab Bar (visible below md: 768px) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-border-subtle flex items-center justify-around px-2 z-30 select-none">
        <button
          onClick={() => setActiveNav('chats')}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-control text-xs font-medium',
            activeNav === 'chats' ? 'text-accent' : 'text-text-muted',
          )}
        >
          <MessageSquare className="w-5 h-5 stroke-[1.75]" />
          <span>Chats</span>
        </button>

        <button
          onClick={() => setActiveNav('connection')}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-control text-xs font-medium',
            activeNav === 'connection' ? 'text-accent' : 'text-text-muted',
          )}
        >
          <QrCode className="w-5 h-5 stroke-[1.75]" />
          <span>Device</span>
        </button>

        <button
          onClick={() => setActiveNav('settings')}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-control text-xs font-medium',
            activeNav === 'settings' ? 'text-accent' : 'text-text-muted',
          )}
        >
          <Settings className="w-5 h-5 stroke-[1.75]" />
          <span>Settings</span>
        </button>

        <button
          onClick={() => setActiveNav('design')}
          className={cn(
            'flex flex-col items-center gap-1 p-2 rounded-control text-xs font-medium',
            activeNav === 'design' ? 'text-accent' : 'text-text-muted',
          )}
        >
          <Palette className="w-5 h-5 stroke-[1.75]" />
          <span>Design</span>
        </button>

        <button
          onClick={toggleTheme}
          className="flex flex-col items-center gap-1 p-2 rounded-control text-xs font-medium text-text-muted"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 stroke-[1.75]" />
          ) : (
            <Sun className="w-5 h-5 stroke-[1.75]" />
          )}
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>
      </nav>
    </>
  );
};
