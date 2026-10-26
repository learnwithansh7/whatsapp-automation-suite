import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Smartphone,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Server,
  Database,
  Layers,
  Key,
  CheckCircle2,
  Clock,
  AlertCircle,
  Unplug,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useToastStore } from '../store/useToastStore';
import { api, Session } from '../lib/api';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  responseTimeMs: number;
  services: {
    backend: string;
    database: {
      status: string;
      latencyMs: number | null;
      error: string | null;
    };
    redis: {
      status: string;
    };
  };
}

export const ConnectionView: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();

  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isPairingMode, setIsPairingMode] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  // Health Query
  const { data: health, refetch: refetchHealth, isFetching: isHealthFetching } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // Sessions Query
  const {
    data: sessionsData,
    isLoading: isSessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
    refetchInterval: 5000,
  });

  // Create default primary session if none exists
  useEffect(() => {
    if (sessionsData && sessionsData.sessions.length === 0) {
      api.createSession('Primary Account').then(() => {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      });
    }
  }, [sessionsData, queryClient]);

  const activeSession: Session | undefined = sessionsData?.sessions[0];

  // Mutations
  const connectMutation = useMutation({
    mutationFn: (id: string) => api.connect(id),
    onSuccess: () => {
      addToast({
        title: 'Connection Started',
        message: 'Awaiting QR code from WhatsApp socket...',
        type: 'info',
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Connection Failed',
        message: err.message,
        type: 'error',
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => api.disconnect(id),
    onSuccess: () => {
      setIsDisconnectDialogOpen(false);
      addToast({
        title: 'Session Disconnected',
        message: 'WhatsApp socket paused. Saved credentials preserved.',
        type: 'info',
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Disconnect Error',
        message: err.message,
        type: 'error',
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: (id: string) => api.logoutSession(id),
    onSuccess: () => {
      setIsLogoutDialogOpen(false);
      addToast({
        title: 'Logged Out',
        message: 'WhatsApp credentials and signal keys wiped successfully.',
        type: 'warning',
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Logout Error',
        message: err.message,
        type: 'error',
      });
    },
  });

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;

    if (!pairingPhone.trim()) {
      addToast({
        title: 'Phone Number Required',
        message: 'Please enter your WhatsApp phone number with country code (e.g. 919876543210).',
        type: 'warning',
      });
      return;
    }

    setIsPairingLoading(true);
    try {
      const res = await api.requestPairingCode(activeSession.id, pairingPhone);
      setPairingCodeResult(res.code);
      addToast({
        title: 'Pairing Code Generated',
        message: 'Enter this 8-character code on your phone.',
        type: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request pairing code';
      addToast({
        title: 'Pairing Code Error',
        message: msg,
        type: 'error',
      });
    } finally {
      setIsPairingLoading(false);
    }
  };

  const getStatusBadge = (status?: Session['status']) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="success" dot>
            Connected
          </Badge>
        );
      case 'connecting':
        return (
          <Badge variant="warning" dot>
            Connecting...
          </Badge>
        );
      case 'qr':
        return (
          <Badge variant="warning" dot>
            Scan QR Code
          </Badge>
        );
      case 'reconnecting':
        return (
          <Badge variant="warning" dot>
            Reconnecting...
          </Badge>
        );
      case 'logged_out':
        return (
          <Badge variant="default" dot>
            Logged Out
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="danger" dot>
            Error
          </Badge>
        );
      case 'idle':
      default:
        return (
          <Badge variant="default" dot>
            Disconnected
          </Badge>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-app flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <h1 className="text-2xl font-semibold text-text-main tracking-tight flex items-center gap-2.5">
              <QrCode className="w-6 h-6 text-accent" />
              WhatsApp Linked Device
            </h1>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              Pair your personal WhatsApp account via linked device QR protocol (Baileys isolated engine)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                refetchHealth();
                refetchSessions();
              }}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isHealthFetching ? 'animate-spin' : ''}`} />}
            >
              Sync Status
            </Button>
          </div>
        </div>

        {/* Backend Infrastructure Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card variant="subtle" className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server className="w-4 h-4 text-accent" />
              <div>
                <p className="text-xs font-semibold text-text-main">Fastify API</p>
                <p className="text-[11px] text-text-muted">Port 3000</p>
              </div>
            </div>
            <Badge variant={health?.services.backend === 'ok' ? 'success' : 'danger'} size="sm" dot>
              {health?.services.backend === 'ok' ? 'OK' : 'Offline'}
            </Badge>
          </Card>

          <Card variant="subtle" className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Database className="w-4 h-4 text-info" />
              <div>
                <p className="text-xs font-semibold text-text-main">PostgreSQL 16</p>
                <p className="text-[11px] text-text-muted">Prisma Migrated</p>
              </div>
            </div>
            <Badge
              variant={health?.services.database.status === 'connected' ? 'success' : 'danger'}
              size="sm"
              dot
            >
              {health?.services.database.status === 'connected' ? 'Connected' : 'Disconnected'}
            </Badge>
          </Card>

          <Card variant="subtle" className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-warning" />
              <div>
                <p className="text-xs font-semibold text-text-main">Redis Queue</p>
                <p className="text-[11px] text-text-muted">BullMQ</p>
              </div>
            </div>
            <Badge variant="default" size="sm">
              Not Configured (Phase 3)
            </Badge>
          </Card>
        </div>

        {/* Primary Pairing Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* QR Code & Active Session Card (7 cols) */}
          <Card className="lg:col-span-7 flex flex-col justify-between">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-accent" />
                  {activeSession?.name || 'Primary WhatsApp Account'}
                </CardTitle>
                {getStatusBadge(activeSession?.status)}
              </div>
              <CardDescription>
                Session ID:{' '}
                <span className="font-mono text-text-main">
                  {activeSession?.id || 'Initializing...'}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col items-center justify-center py-6">
              {/* Framed QR Code / Status Area */}
              <div className="relative w-72 h-72 p-4 rounded-card bg-surface border-2 border-dashed border-border-strong flex flex-col items-center justify-center text-center shadow-card transition-all">
                {isSessionsLoading ? (
                  <Spinner size="lg" className="text-accent" />
                ) : activeSession?.status === 'connected' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-accent-soft text-accent flex items-center justify-center shadow-subtle">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-text-main">
                        Device Linked & Active
                      </p>
                      <p className="text-xs text-text-muted mt-1 max-w-[220px]">
                        Backend is linked to WhatsApp. Credentials are encrypted in PostgreSQL.
                      </p>
                    </div>
                  </div>
                ) : isPairingMode ? (
                  <div className="w-full flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-info-soft text-info flex items-center justify-center">
                      <Key className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-semibold text-text-main">Pairing Code</h4>

                    {pairingCodeResult ? (
                      <div className="p-3 bg-surface-subtle border border-border-subtle rounded-control flex flex-col items-center gap-1">
                        <span className="text-xs text-text-muted">Enter on WhatsApp:</span>
                        <span className="text-2xl font-mono font-bold tracking-widest text-accent">
                          {pairingCodeResult}
                        </span>
                      </div>
                    ) : (
                      <form onSubmit={handleRequestPairingCode} className="w-full flex flex-col gap-2">
                        <Input
                          placeholder="e.g. 919876543210"
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          className="text-center font-mono"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          isLoading={isPairingLoading}
                        >
                          Generate Code
                        </Button>
                      </form>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsPairingMode(false);
                        setPairingCodeResult(null);
                      }}
                      className="text-xs text-text-muted hover:text-text-main underline mt-1"
                    >
                      Use QR code instead
                    </button>
                  </div>
                ) : activeSession?.qr ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-2.5 bg-white rounded-control border border-border-subtle shadow-subtle">
                      <QRCodeSVG
                        value={activeSession.qr}
                        size={190}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3 animate-spin text-accent" />
                      Live QR (Auto-updating)
                    </span>
                  </div>
                ) : activeSession?.status === 'connecting' || connectMutation.isPending ? (
                  <div className="flex flex-col items-center gap-3">
                    <Spinner size="lg" className="text-accent" />
                    <p className="text-xs text-text-muted">Starting WhatsApp socket...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-surface-subtle flex items-center justify-center text-text-muted">
                      <QrCode className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-main">
                        Scan to Link WhatsApp
                      </p>
                      <p className="text-xs text-text-muted mt-1 max-w-[200px]">
                        Click "Connect WhatsApp" to display the live pairing QR code.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Phone & Last Disconnect Info */}
              <div className="w-full mt-6 flex flex-col gap-2">
                <div className="p-3 rounded-control bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs">
                  <span className="text-text-muted">Connected Number:</span>
                  <span className="font-semibold text-text-main font-mono">
                    {activeSession?.phoneNumber ? `+${activeSession.phoneNumber}` : 'None linked'}
                  </span>
                </div>

                {activeSession?.lastConnectedAt && (
                  <div className="px-3 text-[11px] text-text-muted flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Last connected: {new Date(activeSession.lastConnectedAt).toLocaleString()}</span>
                  </div>
                )}

                {activeSession?.lastDisconnectReason && (
                  <div className="px-3 text-[11px] text-amber-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{activeSession.lastDisconnectReason}</span>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {activeSession?.status === 'connected' ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setIsDisconnectDialogOpen(true)}
                    leftIcon={<Unplug className="w-4 h-4" />}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => activeSession && connectMutation.mutate(activeSession.id)}
                    isLoading={connectMutation.isPending || activeSession?.status === 'connecting'}
                    leftIcon={<QrCode className="w-4 h-4" />}
                  >
                    Connect WhatsApp
                  </Button>
                )}

                {activeSession?.status !== 'connected' && !isPairingMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPairingMode(true)}
                  >
                    Use pairing code
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setIsLogoutDialogOpen(true)}
                  leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  disabled={!activeSession || activeSession.status === 'idle'}
                >
                  Logout Session
                </Button>
              </div>
            </CardFooter>
          </Card>

          {/* Instructions & Architecture Guarantee (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">How to Link Your WhatsApp</CardTitle>
                <CardDescription>
                  Follow these 3 simple steps on your mobile phone
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent-soft text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-main">Open WhatsApp</p>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Launch WhatsApp on your mobile device and navigate to <b>Settings</b> (iOS) or tap the <b>Three Dots Menu</b> (Android).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent-soft text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-main">Tap Linked Devices</p>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Select <b>Linked Devices</b> and tap <b>Link a Device</b>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent-soft text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-main">Scan the QR Code</p>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Scan the live QR code on this screen. WhatsApp will authenticate and establish the session.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="subtle" className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
                <ShieldCheck className="w-4 h-4 text-accent" />
                Multi-Account & Reconnect Guarantee
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Credentials and signal pre-keys are encrypted with <b>AES-256-GCM</b> in PostgreSQL. When the backend restarts, your session automatically reconnects <b>without scanning a new QR</b>.
              </p>
            </Card>
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      <Dialog
        isOpen={isDisconnectDialogOpen}
        onClose={() => setIsDisconnectDialogOpen(false)}
        title="Disconnect WhatsApp Session?"
        description="This will pause the socket connection. Your linked credentials will remain saved in PostgreSQL so you can reconnect anytime without scanning a QR code."
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => setIsDisconnectDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => activeSession && disconnectMutation.mutate(activeSession.id)}
            isLoading={disconnectMutation.isPending}
          >
            Disconnect Socket
          </Button>
        </div>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog
        isOpen={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        title="Logout and Wipe Credentials?"
        description="This will permanently disconnect this device from your WhatsApp account and delete all stored encryption credentials and signal keys from the database. A new QR code scan will be required next time."
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={() => setIsLogoutDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => activeSession && logoutMutation.mutate(activeSession.id)}
            isLoading={logoutMutation.isPending}
          >
            Confirm Logout & Wipe
          </Button>
        </div>
      </Dialog>
    </div>
  );
};
