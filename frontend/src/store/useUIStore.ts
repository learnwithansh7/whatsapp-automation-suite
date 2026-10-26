import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../lib/api';

export type Theme = 'light' | 'dark';
export type NavItem =
  | 'chats'
  | 'connection'
  | 'automations'
  | 'labels'
  | 'analytics'
  | 'settings'
  | 'design'
  | 'login';

interface UIState {
  theme: Theme;
  activeNav: NavItem;
  isSidebarOpen: boolean;
  mobileView: 'list' | 'chat';
  currentUser: User | null;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setActiveNav: (nav: NavItem) => void;
  toggleSidebar: () => void;
  setMobileView: (view: 'list' | 'chat') => void;
  setCurrentUser: (user: User | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      activeNav: 'connection',
      isSidebarOpen: true,
      mobileView: 'list',
      currentUser: null,

      toggleTheme: () =>
        set((state) => {
          const next = state.theme === 'light' ? 'dark' : 'light';
          if (typeof document !== 'undefined') {
            if (next === 'dark') {
              document.documentElement.classList.add('dark');
            } else {
              document.documentElement.classList.remove('dark');
            }
          }
          return { theme: next };
        }),

      setTheme: (theme) => {
        if (typeof document !== 'undefined') {
          if (theme === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        set({ theme });
      },

      setActiveNav: (activeNav) => set({ activeNav }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setMobileView: (mobileView) => set({ mobileView }),
      setCurrentUser: (currentUser) => set({ currentUser }),
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
