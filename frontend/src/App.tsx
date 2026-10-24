import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Database,
  Layers,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';

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
  // Use relative path '/api/health' (forwarded to Fastify via Vite proxy)
  const res = await fetch('/api/health');
  if (!res.ok && res.status !== 503) {
    throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

export default function App() {
  const { data, error, isLoading, isFetching, refetch } = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000, // Poll every 10 seconds for live status
  });

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-700/60 bg-slate-900/60 backdrop-blur-md sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xl shadow-lg shadow-emerald-500/10">
            💬
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              WhatsApp Client
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Phase 0
              </span>
            </h1>
            <p className="text-xs text-slate-400">Custom Linked Device Web Application</p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium border border-slate-700 text-slate-200 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 flex flex-col justify-center">
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-sm">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-700/80 gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                System Health & Connectivity
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Real-time connection verification for local services
              </p>
            </div>

            {data && (
              <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/60">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Uptime: {formatUptime(data.uptime)}</span>
                <span className="text-slate-600">|</span>
                <span>{data.responseTimeMs}ms</span>
              </div>
            )}
          </div>

          {/* Status Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {/* Backend Service Card */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">Backend API</h3>
                    <p className="text-xs text-slate-400">Node.js + Fastify</p>
                  </div>
                </div>
                {error ? (
                  <XCircle className="w-5 h-5 text-rose-500" />
                ) : isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md ${
                    error
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : isLoading
                        ? 'bg-slate-700/40 text-slate-400'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {error ? 'Unreachable' : isLoading ? 'Checking...' : 'Backend OK'}
                </span>
              </div>
            </div>

            {/* Database Service Card */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">PostgreSQL</h3>
                    <p className="text-xs text-slate-400">Prisma ORM</p>
                  </div>
                </div>
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                ) : data?.services.database.status === 'connected' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md ${
                    isLoading
                      ? 'bg-slate-700/40 text-slate-400'
                      : data?.services.database.status === 'connected'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {isLoading
                    ? 'Checking...'
                    : data?.services.database.status === 'connected'
                      ? 'Database OK'
                      : 'Database Disconnected'}
                </span>
                {data?.services.database.latencyMs !== null &&
                  data?.services.database.latencyMs !== undefined && (
                    <span className="text-[11px] text-slate-400">
                      {data.services.database.latencyMs}ms
                    </span>
                  )}
              </div>
            </div>

            {/* Redis Service Card */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">Redis Queue</h3>
                    <p className="text-xs text-slate-400">BullMQ (Phase 3)</p>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-slate-400 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                  Optional
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700">
                  {data?.services.redis.status === 'configured'
                    ? 'Redis OK'
                    : 'Redis: not configured'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Connection Note / Error details */}
          {data?.services.database.error && (
            <div className="mt-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <p className="font-semibold mb-1">Database connection issue detected:</p>
              <p className="font-mono text-amber-300/80 break-all">
                {data.services.database.error}
              </p>
            </div>
          )}

          {/* Informational Footer */}
          <div className="mt-6 pt-5 border-t border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-2">
            <div>
              Active Location: <span className="font-mono text-slate-300">D:\whatsapp-client</span>
            </div>
            <div className="flex items-center gap-3">
              <span>TypeScript Strict</span>
              <span>•</span>
              <span>Fastify</span>
              <span>•</span>
              <span>React Vite</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
