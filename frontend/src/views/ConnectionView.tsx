import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  QrCode,
  Smartphone,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Server,
  Database,
  Layers,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useToastStore } from '../store/useToastStore';

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

const fetchHealth = async (): Promise<HealthResponse> => {
  const res = await fetch('/api/health');
  if (!res.ok && res.status !== 503) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

export const ConnectionView: React.FC = () => {
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const { addToast } = useToastStore();

  const { data: health, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });

  const handleConnect = () => {
    setSessionStatus('connecting');
    addToast({
      title: 'QR Code Requested',
      message: 'Generating session credentials for linked device pairing...',
      type: 'info',
    });

    setTimeout(() => {
      addToast({
        title: 'Phase 1 Ready',
        message: 'Baileys session pairing will connect via Socket.IO in Phase 1.',
        type: 'success',
      });
    }, 1500);
  };

  const handleDisconnect = () => {
    setSessionStatus('idle');
    addToast({
      title: 'Session Disconnected',
      message: 'WhatsApp linked session has been paused.',
      type: 'warning',
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-app flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col gap-6">
        {/* Page Title & Subtitle */}
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
              onClick={() => refetchHealth()}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isHealthLoading ? 'animate-spin' : ''}`} />}
            >
              Check Backend
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
                <p className="text-xs font-semibold text-text-main">Redis / BullMQ</p>
                <p className="text-[11px] text-text-muted">Queue Worker</p>
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
                  Primary Session
                </CardTitle>
                <Badge
                  variant={
                    sessionStatus === 'connected'
                      ? 'success'
                      : sessionStatus === 'connecting'
                        ? 'warning'
                        : 'default'
                  }
                  dot
                >
                  {sessionStatus === 'connected'
                    ? 'Connected'
                    : sessionStatus === 'connecting'
                      ? 'Awaiting Scan'
                      : 'Disconnected'}
                </Badge>
              </div>
              <CardDescription>
                Session ID: <span className="font-mono text-text-main">session_primary_01</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col items-center justify-center py-6">
              {/* Framed QR Code Area */}
              <div className="relative w-64 h-64 p-4 rounded-card bg-surface border-2 border-dashed border-border-strong flex flex-col items-center justify-center text-center shadow-card group transition-all">
                {sessionStatus === 'connecting' ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-44 h-44 bg-surface-subtle border border-border-subtle rounded-control p-3 flex flex-col items-center justify-center relative overflow-hidden">
                      {/* Stylized QR mockup placeholder */}
                      <div className="grid grid-cols-5 gap-1.5 opacity-80">
                        {Array.from({ length: 25 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-5 h-5 rounded-sm ${
                              i % 2 === 0 || i % 5 === 0
                                ? 'bg-text-main'
                                : 'bg-transparent border border-border-strong'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-text-muted flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                      Refreshes in 20s
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-accent-soft flex items-center justify-center text-accent">
                      <QrCode className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-text-main">
                        Scan to Link WhatsApp
                      </p>
                      <p className="text-xs text-text-muted mt-1 max-w-[200px]">
                        Click "Start Pairing" below to generate the session QR code.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Phone Info */}
              <div className="w-full mt-6 p-3 rounded-control bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs">
                <span className="text-text-muted">Target Number:</span>
                <span className="font-medium text-text-main font-mono">
                  +91 (Configured upon link)
                </span>
              </div>
            </CardContent>

            <CardFooter className="justify-between gap-3">
              <Button
                variant={sessionStatus === 'idle' ? 'primary' : 'secondary'}
                size="md"
                onClick={handleConnect}
                isLoading={sessionStatus === 'connecting'}
              >
                {sessionStatus === 'idle' ? 'Start Pairing' : 'Regenerate QR'}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleDisconnect}
                  disabled={sessionStatus === 'idle'}
                >
                  Disconnect
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleDisconnect}
                  disabled={sessionStatus === 'idle'}
                  leftIcon={<LogOut className="w-4 h-4" />}
                >
                  Logout
                </Button>
              </div>
            </CardFooter>
          </Card>

          {/* Instructions & Architecture Card (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">How to Connect</CardTitle>
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
                      Launch WhatsApp on your mobile phone and tap <b>Settings</b> or the <b>Three Dots</b> menu.
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
                      Point your phone camera to the QR code displayed on this screen to authenticate.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card variant="subtle" className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
                <ShieldCheck className="w-4 h-4 text-accent" />
                Isolated Engine Guarantee
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                All Baileys socket traffic and session keys are isolated exclusively inside the backend WhatsApp module. The rest of your web app interacts solely through standardized application services.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
