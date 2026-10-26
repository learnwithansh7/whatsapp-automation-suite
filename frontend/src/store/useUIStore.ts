import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setActiveNav: (nav: NavItem) => void;
  toggleSidebar: () => void;
  setMobileView: (view: 'list' | 'chat') => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      activeNav: 'chats',
      isSidebarOpen: true,
      mobileView: 'list',

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
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
