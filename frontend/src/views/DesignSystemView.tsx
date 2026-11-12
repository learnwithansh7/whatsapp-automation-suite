import React, { useState } from 'react';
import {
  Palette,
  CheckCheck,
  Check,
  Search,
  MessageSquare,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { Dialog } from '../components/ui/Dialog';
import { Tooltip } from '../components/ui/Tooltip';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { Switch } from '../components/ui/Switch';
import { useToastStore } from '../store/useToastStore';
import { useUIStore } from '../store/useUIStore';

export const DesignSystemView: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [switchState, setSwitchState] = useState(true);
  const { addToast } = useToastStore();
  const { theme, toggleTheme } = useUIStore();

  const colorTokens = [
    { name: 'App Background', token: 'var(--bg-app)', cssClass: 'bg-app', hex: '#F7F8FA (dark: #0B141A)' },
    { name: 'Surface (Cards)', token: 'var(--bg-surface)', cssClass: 'bg-surface', hex: '#FFFFFF (dark: #111B21)' },
    { name: 'Surface Subtle', token: 'var(--bg-surface-subtle)', cssClass: 'bg-surface-subtle', hex: '#F1F3F5 (dark: #1A2A32)' },
    { name: 'Border Subtle', token: 'var(--border-subtle)', cssClass: 'bg-border-subtle', hex: '#E4E7EB (dark: #233138)' },
    { name: 'Border Strong', token: 'var(--border-strong)', cssClass: 'bg-border-strong', hex: '#D0D5DB (dark: #2A3942)' },
    { name: 'Text Main', token: 'var(--text-main)', cssClass: 'bg-text-main', hex: '#111B21 (dark: #E9EDEF)' },
    { name: 'Text Secondary', token: 'var(--text-secondary)', cssClass: 'bg-text-secondary', hex: '#3B4A54 (dark: #D1D7DB)' },
    { name: 'Text Muted', token: 'var(--text-muted)', cssClass: 'bg-text-muted', hex: '#667781 (dark: #8696A0)' },
    { name: 'Accent Brand', token: 'var(--color-accent)', cssClass: 'bg-accent', hex: '#16A34A (dark: #22C55E)' },
    { name: 'Accent Soft', token: 'var(--color-accent-soft)', cssClass: 'bg-accent-soft', hex: '#E8F7EE' },
    { name: 'Danger', token: 'var(--color-danger)', cssClass: 'bg-danger', hex: '#DC2626' },
    { name: 'Danger Soft', token: 'var(--color-danger-soft)', cssClass: 'bg-danger-soft', hex: '#FDECEC' },
    { name: 'Warning', token: 'var(--color-warning)', cssClass: 'bg-warning', hex: '#D97706' },
    { name: 'Warning Soft', token: 'var(--color-warning-soft)', cssClass: 'bg-warning-soft', hex: '#FEF3E2' },
    { name: 'Info', token: 'var(--color-info)', cssClass: 'bg-info', hex: '#2563EB' },
    { name: 'Info Soft', token: 'var(--color-info-soft)', cssClass: 'bg-info-soft', hex: '#E8F0FE' },
    { name: 'Chat Bubble Out', token: 'var(--chat-bubble-out)', cssClass: 'bg-chat-bubble-out', hex: '#DCF8C6 (dark: #005C4B)' },
    { name: 'Chat Bubble In', token: 'var(--chat-bubble-in)', cssClass: 'bg-chat-bubble-in', hex: '#FFFFFF (dark: #202C33)' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 bg-app flex flex-col items-center">
      <div className="w-full max-w-5xl flex flex-col gap-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-accent bg-accent-soft px-2 py-0.5 rounded-full border border-accent/20">
                /design
              </span>
              <h1 className="text-2xl font-bold text-text-main tracking-tight">
                Design System & Component Gallery
              </h1>
            </div>
            <p className="text-xs text-text-muted mt-1">
              "Clean Light" design tokens, typography scale, UI components, and chat previews.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">
              Current: <strong className="text-text-main capitalize">{theme}</strong>
            </span>
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
            </Button>
          </div>
        </div>

        {/* Section 1: Chat UI Static Preview */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-main tracking-tight flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-accent" />
                Chat UI Preview (Phase 2 Preview)
              </h2>
              <p className="text-xs text-text-muted">
                Static review of message bubbles, timestamps, double-ticks, unread badge, and input.
              </p>
            </div>
          </div>

          <Card className="max-w-xl mx-auto w-full p-4 md:p-6 bg-app">
            <div className="flex flex-col gap-3">
              {/* Unread badge & timestamp divider */}
              <div className="flex justify-center my-1">
                <span className="text-[11px] font-medium text-text-muted px-3 py-0.5 rounded-full bg-surface border border-border-subtle shadow-subtle">
                  Today, 26 October
                </span>
              </div>

              {/* Inbound Message */}
              <div className="flex justify-start max-w-[85%]">
                <div className="bg-chat-bubble-in text-text-main border border-border-subtle rounded-card rounded-tl-none p-3.5 shadow-card">
                  <p className="text-sm leading-relaxed">
                    Hello! How does the new WhatsApp Client Clean Light design look?
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-text-muted">10:14 PM</span>
                  </div>
                </div>
              </div>

              {/* Outbound Message - Single check (sent) */}
              <div className="flex justify-end self-end max-w-[85%]">
                <div className="bg-chat-bubble-out text-text-main border border-border-subtle/50 rounded-card rounded-tr-none p-3.5 shadow-card">
                  <p className="text-sm leading-relaxed">
                    It feels very crisp! White space, soft borders, and the #16A34A green accent.
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-text-muted">10:15 PM</span>
                    <Check className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                </div>
              </div>

              {/* Outbound Message - Double check blue (read) */}
              <div className="flex justify-end self-end max-w-[85%]">
                <div className="bg-chat-bubble-out text-text-main border border-border-subtle/50 rounded-card rounded-tr-none p-3.5 shadow-card">
                  <p className="text-sm leading-relaxed">
                    Ready for the Phase 1 Baileys linked device login!
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-text-muted">10:16 PM</span>
                    <CheckCheck className="w-3.5 h-3.5 text-info" />
                  </div>
                </div>
              </div>

              {/* Unread banner preview */}
              <div className="flex items-center justify-center my-2">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border-subtle text-xs font-medium text-text-secondary shadow-subtle">
                  <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
                    2
                  </span>
                  <span>Unread Messages</span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Section 2: Color Tokens */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-main tracking-tight flex items-center gap-2">
              <Palette className="w-5 h-5 text-accent" />
              Design Tokens (CSS Variables)
            </h2>
            <p className="text-xs text-text-muted">
              Defined in <code className="font-mono text-accent">src/styles/tokens.css</code> and mapped to Tailwind.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {colorTokens.map((item) => (
              <div
                key={item.name}
                className="bg-surface border border-border-subtle rounded-card p-3 flex flex-col gap-2 shadow-card"
              >
                <div
                  className={`w-full h-12 rounded-control border border-border-subtle shadow-subtle ${item.cssClass}`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-main truncate">
                    {item.name}
                  </p>
                  <p className="text-[10px] font-mono text-text-muted truncate">
                    {item.token}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Typography Scale */}
        <section className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Typography Scale (Inter Self-Hosted)</CardTitle>
              <CardDescription>
                Scale: 12 / 14 / 16 / 20 / 28. Default body is 14px with comfortable line height.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 divide-y divide-border-subtle/50">
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-xs font-mono text-text-muted w-24">28px / 36px</span>
                <span className="text-2xl font-bold text-text-main flex-1">
                  Heading 1 (text-2xl font-bold)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <span className="text-xs font-mono text-text-muted w-24">20px / 28px</span>
                <span className="text-xl font-semibold text-text-main flex-1">
                  Heading 2 (text-xl font-semibold)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <span className="text-xs font-mono text-text-muted w-24">16px / 24px</span>
                <span className="text-base font-medium text-text-main flex-1">
                  Heading 3 / Subhead (text-base font-medium)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <span className="text-xs font-mono text-text-muted w-24">14px / 20px</span>
                <span className="text-sm text-text-main flex-1">
                  Body text (text-sm, standard paragraphs, comfortably readable)
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-3">
                <span className="text-xs font-mono text-text-muted w-24">12px / 16px</span>
                <span className="text-xs text-text-secondary flex-1">
                  Caption & Muted label (text-xs text-text-secondary)
                </span>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 4: Component Gallery */}
        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-text-main tracking-tight">
            Component Gallery
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Buttons & Sizes</CardTitle>
                <CardDescription>Primary, secondary, ghost, danger, loading states</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary">Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm">Small (sm)</Button>
                  <Button size="md">Medium (md)</Button>
                  <Button size="lg">Large (lg)</Button>
                  <Button isLoading>Saving</Button>
                </div>
              </CardContent>
            </Card>

            {/* Badges */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Badges (Soft Backgrounds)</CardTitle>
                <CardDescription>Semantic status indicators with optional live dot</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="success" dot>Connected</Badge>
                  <Badge variant="danger" dot>Offline</Badge>
                  <Badge variant="warning" dot>Scanning</Badge>
                  <Badge variant="info" dot>Incoming</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge size="sm" variant="success">Small Success</Badge>
                  <Badge size="sm" variant="danger">Small Danger</Badge>
                  <Badge size="sm" variant="warning">Small Warning</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Form Inputs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inputs & Textarea</CardTitle>
                <CardDescription>Standard, with icons, error states, and helper text</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Input
                  label="Search Contact"
                  placeholder="Type a contact name..."
                  leftIcon={<Search className="w-4 h-4" />}
                />
                <Input
                  label="With Error"
                  placeholder="Invalid value"
                  defaultValue="12345"
                  error="The phone number must include country code."
                />
                <Textarea
                  label="Quick Reply Template"
                  placeholder="Enter auto-reply text here..."
                  helperText="Supports variables like {name} and {time}."
                />
              </CardContent>
            </Card>

            {/* Avatars, Switch & Interactive Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Avatars, Switch & Tooltip</CardTitle>
                <CardDescription>Sizes, status indicators, and interactive helpers</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <Avatar name="Alex Morgan" size="sm" status="online" />
                  <Avatar name="Sarah Connor" size="md" status="busy" />
                  <Avatar name="Dev Team" size="lg" status="offline" />
                  <Avatar name="WhatsApp System" size="xl" />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                  <Switch
                    label="Airplane Mode Mockup"
                    checked={switchState}
                    onChange={setSwitchState}
                  />

                  <Tooltip content="Clean Tooltip Example" position="top">
                    <Button variant="secondary" size="sm">
                      Hover for Tooltip
                    </Button>
                  </Tooltip>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      addToast({
                        title: 'Notification Demo',
                        message: 'This is a clean toast notification rendered via Zustand store.',
                        type: 'success',
                      });
                    }}
                  >
                    Trigger Toast
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsModalOpen(true)}
                  >
                    Open Modal Dialog
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Skeletons & Spinners */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Skeletons & Spinners</CardTitle>
                <CardDescription>Loading states designed to avoid layout shifts</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="circular" className="w-10 h-10" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-full mt-2" />
                </div>

                <div className="flex items-center justify-around p-4 rounded-control bg-surface-subtle border border-border-subtle">
                  <div className="flex flex-col items-center gap-1">
                    <Spinner size="sm" className="text-accent" />
                    <span className="text-[10px] text-text-muted">sm</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Spinner size="md" className="text-accent" />
                    <span className="text-[10px] text-text-muted">md</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Spinner size="lg" className="text-accent" />
                    <span className="text-[10px] text-text-muted">lg</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Modal Dialog Instance */}
        <Dialog
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Disconnect Device Confirmation"
          description="Are you sure you want to unpair this WhatsApp account? Incoming messages will stop until you reconnect."
        >
          <div className="flex flex-col gap-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Your stored credentials in <code className="font-mono bg-surface-subtle px-1 rounded">encryptedAuth</code> will be invalidated.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle/60">
              <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setIsModalOpen(false);
                  addToast({
                    title: 'Disconnected',
                    message: 'Session has been closed successfully.',
                    type: 'info',
                  });
                }}
              >
                Confirm Disconnect
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </div>
  );
};
