import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../lib/api';

export type Theme = 'light' | 'dark' | 'system';
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
  activeSessionId: string | null;
  sendReadReceipts: boolean;
  antiRevokeEnabled: boolean;
  density: 'comfortable' | 'compact';
  chatWallpaper: 'plain' | 'subtle' | 'soft';
  enterToSend: boolean;
  showLinkPreviews: boolean;
  isInfoPanelOpen: boolean;
  isSocketConnected: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setActiveNav: (nav: NavItem) => void;
  toggleSidebar: () => void;
  setMobileView: (view: 'list' | 'chat') => void;
  setCurrentUser: (user: User | null) => void;
  setActiveSessionId: (id: string | null) => void;
  setSendReadReceipts: (val: boolean) => void;
  setAntiRevokeEnabled: (val: boolean) => void;
  setDensity: (val: 'comfortable' | 'compact') => void;
  setChatWallpaper: (val: 'plain' | 'subtle' | 'soft') => void;
  setEnterToSend: (val: boolean) => void;
  setShowLinkPreviews: (val: boolean) => void;
  setIsInfoPanelOpen: (val: boolean) => void;
  setIsSocketConnected: (connected: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      activeNav: 'connection',
      isSidebarOpen: true,
      mobileView: 'list',
      currentUser: null,
      activeSessionId: null,
      sendReadReceipts: false,
      antiRevokeEnabled: true,
      density: 'comfortable',
      chatWallpaper: 'plain',
      enterToSend: true,
      showLinkPreviews: true,
      isInfoPanelOpen: false,
      isSocketConnected: false,

      setIsSocketConnected: (connected: boolean) => set({ isSocketConnected: connected }),
      setSendReadReceipts: (val: boolean) => set({ sendReadReceipts: val }),
      setAntiRevokeEnabled: (val: boolean) => set({ antiRevokeEnabled: val }),
      setDensity: (density) => set({ density }),
      setChatWallpaper: (chatWallpaper) => set({ chatWallpaper }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
      setShowLinkPreviews: (showLinkPreviews) => set({ showLinkPreviews }),
      setIsInfoPanelOpen: (isInfoPanelOpen) => set({ isInfoPanelOpen }),

      toggleTheme: () =>
        set((state) => {
          const next: Theme = state.theme === 'light' ? 'dark' : 'light';
          return { theme: next };
        }),

      setTheme: (theme) => {
        set({ theme });
      },

      setActiveNav: (activeNav) => set({ activeNav }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setMobileView: (mobileView) => set({ mobileView }),
      setCurrentUser: (currentUser) => set({ currentUser }),
      setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({
        theme: state.theme,
        sendReadReceipts: state.sendReadReceipts,
        antiRevokeEnabled: state.antiRevokeEnabled,
        density: state.density,
        chatWallpaper: state.chatWallpaper,
        enterToSend: state.enterToSend,
        showLinkPreviews: state.showLinkPreviews,
        isInfoPanelOpen: state.isInfoPanelOpen,
      }),
    },
  ),
);
