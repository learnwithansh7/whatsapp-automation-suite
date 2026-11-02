import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sun,
  Moon,
  Monitor,
  Sliders,
  Check,
  Smartphone,
  Info,
  Trash2,
  ExternalLink,
  MessageSquare,
  Layers,
  Send,
  Eye,
  ShieldCheck,
  RefreshCw,
  Bot,
  Youtube,
  Instagram,
  Clock,
  Video,
  Save,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Switch } from '../components/ui/Switch';
import { Badge } from '../components/ui/Badge';
import { useUIStore } from '../store/useUIStore';
import { useToastStore } from '../store/useToastStore';
import { api, type AppSettings, type AiConfig } from '../lib/api';
import { cn } from '../lib/utils';

export const SettingsView: React.FC = () => {
  const queryClient = useQueryClient();
  const {
    theme,
    setTheme,
    density,
    setDensity,
    chatWallpaper,
    setChatWallpaper,
    enterToSend,
    setEnterToSend,
    sendReadReceipts,
    setSendReadReceipts,
    showLinkPreviews,
    setShowLinkPreviews,
    antiRevokeEnabled,
    setAntiRevokeEnabled,
    setActiveNav,
    activeSessionId,
  } = useUIStore();

  const { addToast } = useToastStore();

  // Query backend settings on mount to ensure synchronization
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.getSettings();
      if (res?.settings) {
        if (res.settings.theme) setTheme(res.settings.theme);
        if (res.settings.density) setDensity(res.settings.density);
        if (res.settings.chatWallpaper) setChatWallpaper(res.settings.chatWallpaper);
        if (typeof res.settings.enterToSend === 'boolean') setEnterToSend(res.settings.enterToSend);
        if (typeof res.settings.sendReadReceipts === 'boolean') setSendReadReceipts(res.settings.sendReadReceipts);
        if (typeof res.settings.showLinkPreviews === 'boolean') setShowLinkPreviews(res.settings.showLinkPreviews);
        if (typeof res.settings.antiRevokeEnabled === 'boolean') setAntiRevokeEnabled(res.settings.antiRevokeEnabled);
      }
      return res.settings;
    },
    staleTime: 60000,
  });

  // Query sessions for Account section
  const { data: sessionData } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.getSessions(),
    staleTime: 10000,
  });

  // Query storage stats for About section
  const {
    data: storageStats,
    isLoading: isStatsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['storage-stats'],
    queryFn: () => api.getStorageStats(),
    staleTime: 15000,
  });

  // Backend settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (updates: Partial<AppSettings>) => api.updateSettings(updates),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data.settings);
    },
    onError: () => {
      addToast({
        title: 'Settings update failed',
        message: 'Could not sync settings to server.',
        type: 'error',
      });
    },
  });

  // Mutation for clearing cache
  const clearCacheMutation = useMutation({
    mutationFn: () => api.clearCache(),
    onSuccess: (res) => {
      refetchStats();
      addToast({
        title: 'Cache Cleared',
        message: res.message || 'Cached avatars and link previews cleared successfully.',
        type: 'success',
      });
    },
    onError: () => {
      addToast({
        title: 'Error',
        message: 'Failed to clear cache.',
        type: 'error',
      });
    },
  });

  const handleUpdate = (updates: Partial<AppSettings>) => {
    if (updates.theme !== undefined) setTheme(updates.theme);
    if (updates.density !== undefined) setDensity(updates.density);
    if (updates.chatWallpaper !== undefined) setChatWallpaper(updates.chatWallpaper);
    if (updates.enterToSend !== undefined) setEnterToSend(updates.enterToSend);
    if (updates.sendReadReceipts !== undefined) setSendReadReceipts(updates.sendReadReceipts);
    if (updates.showLinkPreviews !== undefined) setShowLinkPreviews(updates.showLinkPreviews);
    if (updates.antiRevokeEnabled !== undefined) setAntiRevokeEnabled(updates.antiRevokeEnabled);

    updateSettingsMutation.mutate(updates);
  };

  const activeSession = sessionData?.sessions?.find(
    (s) => s.id === activeSessionId,
  ) || sessionData?.sessions?.[0];
  const targetSessionId = activeSession?.id || 'default';

  // AI Config & Stats query
  const { data: aiData, refetch: refetchAi } = useQuery({
    queryKey: ['aiConfig', targetSessionId],
    queryFn: () => api.getAiConfig(targetSessionId),
    enabled: !!targetSessionId,
  });

  const [aiForm, setAiForm] = useState<Partial<AiConfig>>({});

  useEffect(() => {
    if (aiData?.config) {
      setAiForm(aiData.config);
    }
  }, [aiData]);

  const updateAiConfigMutation = useMutation({
    mutationFn: (updates: Partial<AiConfig>) => api.updateAiConfig(targetSessionId, updates),
    onSuccess: () => {
      refetchAi();
      addToast({
        title: 'AI Settings Saved',
        message: 'Bio, social links, and anti-ban delay timing updated.',
        type: 'success',
      });
    },
    onError: () => {
      addToast({
        title: 'Error',
        message: 'Failed to update AI settings.',
        type: 'error',
      });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-app flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-main tracking-tight">Settings</h1>
          <p className="text-xs text-text-muted mt-1">
            Manage your interface appearance, chat interaction preferences, and storage.
          </p>
        </div>

        {/* 1. Appearance Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent" />
              Appearance
            </CardTitle>
            <CardDescription>
              Customize theme, layout density, and chat background style.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Theme Selection */}
            <div>
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-3">
                Theme
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Light */}
                <div
                  onClick={() => handleUpdate({ theme: 'light' })}
                  className={cn(
                    'relative p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-2 select-none',
                    theme === 'light'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-text-main text-sm">
                      <Sun className="w-4 h-4 text-warning" />
                      Clean Light
                    </div>
                    {theme === 'light' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">Airy light surfaces & crisp borders</p>
                </div>

                {/* Dark */}
                <div
                  onClick={() => handleUpdate({ theme: 'dark' })}
                  className={cn(
                    'relative p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-2 select-none',
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
                  <p className="text-xs text-text-muted">Low-glare dark palette</p>
                </div>

                {/* System */}
                <div
                  onClick={() => handleUpdate({ theme: 'system' })}
                  className={cn(
                    'relative p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-2 select-none',
                    theme === 'system'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium text-text-main text-sm">
                      <Monitor className="w-4 h-4 text-text-secondary" />
                      System
                    </div>
                    {theme === 'system' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">Follows OS dark/light mode</p>
                </div>
              </div>
            </div>

            {/* Density Selection */}
            <div className="pt-2 border-t border-border-subtle/50">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-3">
                Chat List Density
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => handleUpdate({ density: 'comfortable' })}
                  className={cn(
                    'relative p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-1.5 select-none',
                    density === 'comfortable'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-main">Comfortable (Default)</span>
                    {density === 'comfortable' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    Generous padding, 44px avatars, comfortable reading spacing.
                  </p>
                </div>

                <div
                  onClick={() => handleUpdate({ density: 'compact' })}
                  className={cn(
                    'relative p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-1.5 select-none',
                    density === 'compact'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-main">Compact</span>
                    {density === 'compact' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">
                    Tighter row height and 36px avatars for high-volume chat scanning.
                  </p>
                </div>
              </div>
            </div>

            {/* Chat Wallpaper */}
            <div className="pt-2 border-t border-border-subtle/50">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-3">
                Chat Wallpaper Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => handleUpdate({ chatWallpaper: 'plain' })}
                  className={cn(
                    'p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-1.5 select-none',
                    chatWallpaper === 'plain'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-main">Plain</span>
                    {chatWallpaper === 'plain' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">Solid neutral background</p>
                </div>

                <div
                  onClick={() => handleUpdate({ chatWallpaper: 'subtle' })}
                  className={cn(
                    'p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-1.5 select-none',
                    chatWallpaper === 'subtle'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-main">Subtle Pattern</span>
                    {chatWallpaper === 'subtle' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">WhatsApp-style faint doodle texture</p>
                </div>

                <div
                  onClick={() => handleUpdate({ chatWallpaper: 'soft' })}
                  className={cn(
                    'p-3.5 rounded-control border cursor-pointer transition-all duration-fast flex flex-col gap-1.5 select-none',
                    chatWallpaper === 'soft'
                      ? 'border-accent bg-accent-soft/30 shadow-subtle ring-2 ring-accent/20'
                      : 'border-border-subtle bg-surface hover:border-border-strong',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-main">Soft Tint</span>
                    {chatWallpaper === 'soft' && (
                      <div className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">Subtle warm emerald tint</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Chat Behavior Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent" />
              Chat Behavior
            </CardTitle>
            <CardDescription>
              Configure messaging actions, receipts, link previews, and anti-revoke protections.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border-subtle/50">
            {/* Enter to Send */}
            <div className="py-3 first:pt-0 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-text-muted" />
                  <p className="text-sm font-medium text-text-main">Enter to Send</p>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  When enabled, press Enter to send and Shift+Enter for new lines. When disabled, Enter inserts a new line.
                </p>
              </div>
              <Switch
                checked={enterToSend}
                onChange={(val) => handleUpdate({ enterToSend: val })}
              />
            </div>

            {/* Read Receipts */}
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-main">Send Read Receipts (Blue Ticks)</p>
                <p className="text-xs text-text-muted mt-0.5">
                  When OFF, opening a chat resets local unread counters without alerting the other party. Default is OFF.
                </p>
              </div>
              <Switch
                checked={sendReadReceipts}
                onChange={(val) => handleUpdate({ sendReadReceipts: val })}
              />
            </div>

            {/* Link Previews */}
            <div className="py-3 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-text-muted" />
                  <p className="text-sm font-medium text-text-main">Show Link Previews</p>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Automatically generate secure, server-side rich link cards for URLs shared in chats.
                </p>
              </div>
              <Switch
                checked={showLinkPreviews}
                onChange={(val) => handleUpdate({ showLinkPreviews: val })}
              />
            </div>

            {/* Anti-Revoke */}
            <div className="py-3 last:pb-0 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  <p className="text-sm font-medium text-text-main">Anti-Revoke</p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-soft text-accent border border-accent/20">
                    Active
                  </span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Preserve and clearly badge messages and media when a sender deletes them for everyone.
                </p>
              </div>
              <Switch
                checked={antiRevokeEnabled}
                onChange={(val) => handleUpdate({ antiRevokeEnabled: val })}
              />
            </div>
          </CardContent>
        </Card>

        {/* 3. AI Auto-Reply & Concierge Section (Phase 5) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-accent" />
                <CardTitle className="text-sm">AI Auto-Reply & Concierge</CardTitle>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-accent-soft text-accent border border-accent/20">
                  Zero API Key
                </span>
              </div>
              <Badge
                variant={aiForm.isEnabled ? 'success' : 'default'}
                size="sm"
              >
                {aiForm.isEnabled ? 'AI Engine Active' : 'AI Paused'}
              </Badge>
            </div>
            <CardDescription>
              Human-simulated auto-replies for your bio, YouTube channel, subscriber count, and Google Meet scheduling. (Strictly 1-on-1 chats only, never groups).
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/* Master Toggle & Anti-Ban Summary Banner */}
            <div className="p-3.5 rounded-control bg-surface-subtle/80 border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-main flex items-center gap-1.5">
                  <span>Master Auto-Reply Switch</span>
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  When enabled, chats with the AI toggle ON will receive natural responses after a 10s reading pause.
                </p>
              </div>
              <Switch
                checked={!!aiForm.isEnabled}
                onChange={(val) => {
                  setAiForm((prev) => ({ ...prev, isEnabled: val }));
                  updateAiConfigMutation.mutate({ isEnabled: val });
                }}
              />
            </div>

            {/* Live Anti-Ban Safety Telemetry */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-muted uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3 text-accent" />
                  Human Reading Delay
                </span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  8s – 14s (avg 10s)
                </span>
                <span className="text-[10px] text-text-muted">+ typing speed simulation</span>
              </div>

              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-muted uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-accent" />
                  Today's Replies
                </span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  {aiData?.stats.todayCount ?? 0} / {aiForm.dailyLimit ?? 50}
                </span>
                <span className="text-[10px] text-text-muted">Daily safety limit</span>
              </div>

              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-1">
                <span className="text-[11px] font-medium text-text-muted uppercase flex items-center gap-1">
                  <Bot className="w-3 h-3 text-accent" />
                  Active Chats
                </span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  {aiData?.stats.totalEnabledChats ?? 0} chats
                </span>
                <span className="text-[10px] text-text-muted">Toggle per-chat in header</span>
              </div>
            </div>

            {/* Knowledge Base Editor */}
            <div className="flex flex-col gap-4 pt-2 border-t border-border-subtle/50">
              <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Personal & Social Knowledge Base
              </label>

              {/* Developer Bio */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-main">
                  Developer Bio / "Who are you?" response
                </label>
                <textarea
                  rows={2}
                  value={aiForm.developerBio || ''}
                  onChange={(e) => setAiForm((prev) => ({ ...prev, developerBio: e.target.value }))}
                  placeholder="e.g. I am a Web Developer and YouTuber. I build modern web applications and tech tutorials."
                  className="w-full bg-surface-subtle border border-border-subtle rounded-control p-2.5 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface leading-relaxed resize-none"
                />
              </div>

              {/* YouTube Link & Subscriber Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-main flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-danger" />
                    YouTube Channel Link
                  </label>
                  <input
                    type="url"
                    value={aiForm.youtubeUrl || ''}
                    onChange={(e) => setAiForm((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
                    placeholder="https://youtube.com/@yourchannel"
                    className="w-full bg-surface-subtle border border-border-subtle rounded-control px-3 py-2 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-main flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-danger" />
                    Subscriber Count
                  </label>
                  <input
                    type="text"
                    value={aiForm.youtubeSubs || ''}
                    onChange={(e) => setAiForm((prev) => ({ ...prev, youtubeSubs: e.target.value }))}
                    placeholder="e.g. 25.4K or 100K+"
                    className="w-full bg-surface-subtle border border-border-subtle rounded-control px-3 py-2 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface"
                  />
                </div>
              </div>

              {/* Instagram URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-main flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-accent" />
                  Instagram Profile Link
                </label>
                <input
                  type="url"
                  value={aiForm.instagramUrl || ''}
                  onChange={(e) => setAiForm((prev) => ({ ...prev, instagramUrl: e.target.value }))}
                  placeholder="https://instagram.com/yourhandle"
                  className="w-full bg-surface-subtle border border-border-subtle rounded-control px-3 py-2 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface"
                />
              </div>

              {/* Google Meet / Call scheduling */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-main flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-info" />
                  Google Meet / Call Scheduling Message
                </label>
                <textarea
                  rows={2}
                  value={aiForm.googleMeetMessage || ''}
                  onChange={(e) => setAiForm((prev) => ({ ...prev, googleMeetMessage: e.target.value }))}
                  placeholder="Wait, let me check my schedule and I will get back to you shortly with an available time slot!"
                  className="w-full bg-surface-subtle border border-border-subtle rounded-control p-2.5 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface leading-relaxed resize-none"
                />
              </div>

              {/* Away / Fallback message */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-main">
                  Polite Away / Fallback Message (for other questions)
                </label>
                <textarea
                  rows={2}
                  value={aiForm.fallbackMessage || ''}
                  onChange={(e) => setAiForm((prev) => ({ ...prev, fallbackMessage: e.target.value }))}
                  placeholder="I'm currently away from my desk, but I've received your message and will reply personally soon!"
                  className="w-full bg-surface-subtle border border-border-subtle rounded-control p-2.5 text-xs text-text-main placeholder:text-text-muted outline-none focus:border-accent focus:bg-surface leading-relaxed resize-none"
                />
              </div>

              {/* Anti-Ban Tuning Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-main">
                    Per-Contact Cooldown (minutes)
                  </label>
                  <p className="text-[11px] text-text-muted">0 = natural back-and-forth chat. &gt; 0 = wait X min between replies.</p>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={aiForm.cooldownMin ?? 0}
                    onChange={(e) => setAiForm((prev) => ({ ...prev, cooldownMin: Number(e.target.value) }))}
                    className="w-full bg-surface-subtle border border-border-subtle rounded-control px-3 py-1.5 text-xs text-text-main font-mono outline-none focus:border-accent focus:bg-surface mt-1"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text-main">
                    Daily Auto-Reply Limit
                  </label>
                  <p className="text-[11px] text-text-muted">Maximum auto-replies sent in any 24h rolling period.</p>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={aiForm.dailyLimit ?? 50}
                    onChange={(e) => setAiForm((prev) => ({ ...prev, dailyLimit: Number(e.target.value) }))}
                    className="w-full bg-surface-subtle border border-border-subtle rounded-control px-3 py-1.5 text-xs text-text-main font-mono outline-none focus:border-accent focus:bg-surface mt-1"
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-3 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => updateAiConfigMutation.mutate(aiForm)}
                  disabled={updateAiConfigMutation.isPending}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                >
                  {updateAiConfigMutation.isPending ? 'Saving...' : 'Save AI Knowledge & Settings'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Account Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-accent" />
              Account Connection
            </CardTitle>
            <CardDescription>
              Status of your linked WhatsApp account and session credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center text-accent">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-main">
                    {activeSession?.phoneNumber
                      ? `+${activeSession.phoneNumber}`
                      : 'WhatsApp Account'}
                  </p>
                  <Badge
                    variant={
                      activeSession?.status === 'connected'
                        ? 'success'
                        : activeSession?.status === 'connecting'
                        ? 'warning'
                        : 'default'
                    }
                    size="sm"
                  >
                    {activeSession?.status === 'connected'
                      ? 'Connected'
                      : activeSession?.status === 'connecting'
                      ? 'Connecting'
                      : 'Disconnected'}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  Session ID: <span className="font-mono">{activeSession?.id || 'default'}</span>
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveNav('connection')}
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Manage Connection
            </Button>
          </CardContent>
        </Card>

        {/* 4. About & Storage Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-accent" />
              About & Storage
            </CardTitle>
            <CardDescription>
              Engine versions, storage utilization, and cache management.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {/* Versions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-text-muted uppercase">App Version</span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  v{storageStats?.appVersion || '0.4.2'}
                </span>
              </div>
              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-text-muted uppercase">Baileys Engine</span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  v{storageStats?.baileysVersion || '6.7.24'} (Pinned)
                </span>
              </div>
              <div className="p-3 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-text-muted uppercase">Node.js Runtime</span>
                <span className="text-sm font-semibold text-text-main font-mono">
                  {storageStats?.nodeVersion || 'v20.x'}
                </span>
              </div>
            </div>

            {/* Storage Usage Breakdown */}
            <div className="p-4 rounded-control bg-surface-raised border border-border-subtle flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-text-secondary" />
                  <span className="text-xs font-semibold text-text-main uppercase tracking-wider">
                    Storage Allocation
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchStats()}
                  disabled={isStatsLoading}
                  leftIcon={<RefreshCw className={cn('w-3 h-3', isStatsLoading && 'animate-spin')} />}
                >
                  Refresh
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-text-muted block">Media Files</span>
                  <span className="text-sm font-semibold text-text-main mt-0.5 block">
                    {storageStats?.mediaMB ?? '0.00'} MB
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Profile Avatars</span>
                  <span className="text-sm font-semibold text-text-main mt-0.5 block">
                    {storageStats?.avatarsMB ?? '0.00'} MB
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Link Previews</span>
                  <span className="text-sm font-semibold text-text-main mt-0.5 block">
                    {storageStats?.previewsMB ?? '0.00'} MB
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block">Outbox Queue</span>
                  <span className="text-sm font-semibold text-text-main mt-0.5 block">
                    {storageStats?.outboxCount ?? 0} pending
                  </span>
                </div>
              </div>
            </div>

            {/* Clear Cache Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-text-main">Clear Temporary Cache</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Deletes cached avatars and preview thumbnails to reclaim disk space. Does not affect chats, messages, or downloaded media.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => clearCacheMutation.mutate()}
                disabled={clearCacheMutation.isPending}
                leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              >
                {clearCacheMutation.isPending ? 'Clearing...' : 'Clear Cached Avatars & Previews'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};