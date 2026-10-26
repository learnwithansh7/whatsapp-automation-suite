import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { prisma } from '../lib/prisma.js';
import { usePrismaAuthState } from './authState.js';
import { calculateBackoff, classifyDisconnectReason } from './backoff.js';

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'qr'
  | 'connected'
  | 'reconnecting'
  | 'logged_out'
  | 'error';

export interface SessionStatusInfo {
  sessionId: string;
  status: SessionStatus;
  phoneNumber?: string | null;
  lastConnectedAt?: Date | null;
  lastDisconnectReason?: string | null;
  qr?: string | null;
}

export type SessionEvent =
  | { type: 'status'; sessionId: string; status: SessionStatus; phoneNumber?: string | null; error?: string | null }
  | { type: 'qr'; sessionId: string; qr: string };

class SessionManager {
  private sockets = new Map<string, WASocket>();
  private statuses = new Map<string, SessionStatusInfo>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private retryCounts = new Map<string, number>();
  private listeners: ((event: SessionEvent) => void)[] = [];

  // Base logger set to warn for Baileys internal noise
  private baseLogger = pino({ level: 'warn' });

  public onEvent(listener: (event: SessionEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: SessionEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in session event listener:', err);
      }
    }
  }

  public getStatus(sessionId: string): SessionStatusInfo {
    return (
      this.statuses.get(sessionId) ?? {
        sessionId,
        status: 'idle',
      }
    );
  }

  public getAllStatuses(): SessionStatusInfo[] {
    return Array.from(this.statuses.values());
  }

  private updateStatus(
    sessionId: string,
    status: SessionStatus,
    extra?: Partial<SessionStatusInfo>,
  ) {
    const prev = this.getStatus(sessionId);
    const updated: SessionStatusInfo = {
      ...prev,
      ...extra,
      sessionId,
      status,
    };

    this.statuses.set(sessionId, updated);

    // Persist status change to PostgreSQL
    prisma.session
      .update({
        where: { id: sessionId },
        data: {
          status,
          ...(extra?.phoneNumber !== undefined ? { phoneNumber: extra.phoneNumber } : {}),
          ...(extra?.lastConnectedAt !== undefined ? { lastConnectedAt: extra.lastConnectedAt } : {}),
          ...(extra?.lastDisconnectReason !== undefined
            ? { lastDisconnectReason: extra.lastDisconnectReason }
            : {}),
        },
      })
      .catch((err) => {
        console.error(`[SessionManager] Failed to persist status for ${sessionId}:`, err);
      });

    this.emit({
      type: 'status',
      sessionId,
      status,
      phoneNumber: updated.phoneNumber,
      error: updated.lastDisconnectReason,
    });
  }

  /**
   * Start a Baileys session socket for the specified sessionId.
   */
  public async startSession(sessionId: string): Promise<void> {
    // Prevent duplicate sockets for the same sessionId
    if (this.sockets.has(sessionId)) {
      console.log(`[SessionManager:${sessionId}] Socket already active. Ignoring start.`);
      return;
    }

    // Clear any pending reconnection timer
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
    }

    const sessionLogger = this.baseLogger.child({ sessionId });
    this.updateStatus(sessionId, 'connecting');

    try {
      const { state, saveCreds } = await usePrismaAuthState(sessionId, sessionLogger);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        version,
        auth: state,
        logger: sessionLogger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.sockets.set(sessionId, sock);

      // Listen for credentials updates and save to database
      sock.ev.on('creds.update', saveCreds);

      // Listen for connection updates
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.updateStatus(sessionId, 'qr', { qr });
          this.emit({ type: 'qr', sessionId, qr });
        }

        if (connection === 'open') {
          this.retryCounts.set(sessionId, 0);

          // Extract connected user JID / phone number
          const userJid = sock.user?.id || '';
          const phoneNumber = userJid.split(':')[0]?.split('@')[0] || sock.user?.name || null;
          const lastConnectedAt = new Date();

          this.updateStatus(sessionId, 'connected', {
            phoneNumber,
            lastConnectedAt,
            qr: null,
            lastDisconnectReason: null,
          });

          console.log(`[SessionManager:${sessionId}] Connection OPEN as ${phoneNumber}`);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
          const action = classifyDisconnectReason(statusCode);
          const reasonText = `Status ${statusCode || 'unknown'}`;

          this.sockets.delete(sessionId);

          switch (action) {
            case 'wipe_logout': {
              console.log(`[SessionManager:${sessionId}] Logged out. Wiping credentials.`);
              await this.wipeCredentials(sessionId);
              this.updateStatus(sessionId, 'logged_out', {
                phoneNumber: null,
                lastDisconnectReason: 'Session logged out from device',
                qr: null,
              });
              break;
            }

            case 'restart_immediate': {
              console.log(`[SessionManager:${sessionId}] Restart required after pairing scan. Re-initializing immediately.`);
              this.startSession(sessionId).catch(console.error);
              break;
            }

            case 'stop_replaced': {
              console.log(`[SessionManager:${sessionId}] Connection replaced by another device instance.`);
              this.updateStatus(sessionId, 'error', {
                lastDisconnectReason: 'Connection replaced by another WhatsApp Web instance.',
                qr: null,
              });
              break;
            }

            case 'reconnect_backoff':
            default: {
              const currentRetries = (this.retryCounts.get(sessionId) || 0) + 1;
              this.retryCounts.set(sessionId, currentRetries);
              const delay = calculateBackoff(currentRetries);

              this.updateStatus(sessionId, 'reconnecting', {
                lastDisconnectReason: reasonText,
                qr: null,
              });

              console.log(`[SessionManager:${sessionId}] Connection closed (${reasonText}). Reconnecting in ${delay}ms (attempt #${currentRetries})...`);

              const timer = setTimeout(() => {
                this.startSession(sessionId).catch(console.error);
              }, delay);

              this.reconnectTimers.set(sessionId, timer);
              break;
            }
          }
        }
      });
    } catch (err: unknown) {
      this.sockets.delete(sessionId);
      const errMsg = err instanceof Error ? err.message : 'Failed to initialize session';
      this.updateStatus(sessionId, 'error', { lastDisconnectReason: errMsg });
      console.error(`[SessionManager:${sessionId}] Failed to start session:`, err);
    }
  }

  /**
   * Request an 8-character pairing code instead of scanning a QR code.
   */
  public async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      throw new Error('Invalid phone number format');
    }

    let sock = this.sockets.get(sessionId);
    if (!sock) {
      await this.startSession(sessionId);
      sock = this.sockets.get(sessionId);
    }

    if (!sock) {
      throw new Error('Socket could not be started for pairing code generation');
    }

    // Wait a brief moment for socket handshakes if just initialized
    await new Promise((r) => setTimeout(r, 1500));

    const code = await sock.requestPairingCode(cleanNumber);
    return code;
  }

  /**
   * Stop session socket cleanly without wiping stored credentials.
   */
  public async stopSession(sessionId: string): Promise<void> {
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
    }

    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // Socket ending
      }
      this.sockets.delete(sessionId);
    }

    this.updateStatus(sessionId, 'idle', { qr: null });
  }

  /**
   * Logout from WhatsApp server and wipe credentials and keys from PostgreSQL.
   */
  public async logoutSession(sessionId: string): Promise<void> {
    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        await sock.logout();
      } catch {
        // Ignore socket logout error
      }
      this.sockets.delete(sessionId);
    }

    await this.wipeCredentials(sessionId);
    this.updateStatus(sessionId, 'logged_out', {
      phoneNumber: null,
      lastDisconnectReason: 'Explicitly logged out by user',
      qr: null,
    });
  }

  private async wipeCredentials(sessionId: string): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.authKey.deleteMany({ where: { sessionId } }),
        prisma.session.update({
          where: { id: sessionId },
          data: {
            encryptedCreds: null,
            phoneNumber: null,
            status: 'logged_out',
          },
        }),
      ]);
    } catch (err) {
      console.error(`[SessionManager:${sessionId}] Error wiping credentials:`, err);
    }
  }

  /**
   * Automatically restart all sessions with stored credentials on backend boot.
   */
  public async initAutoStart(): Promise<void> {
    try {
      const activeSessions = await prisma.session.findMany({
        where: {
          encryptedCreds: { not: null },
        },
      });

      console.log(`[SessionManager] Auto-starting ${activeSessions.length} existing WhatsApp sessions...`);
      for (const session of activeSessions) {
        this.startSession(session.id).catch((err) => {
          console.error(`[SessionManager] Failed to auto-start session ${session.id}:`, err);
        });
      }
    } catch (err) {
      console.error('[SessionManager] Failed to query sessions for auto-start:', err);
    }
  }

  /**
   * Graceful shutdown on SIGINT / SIGTERM.
   */
  public async shutdownAll(): Promise<void> {
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    for (const sock of this.sockets.values()) {
      try {
        sock.end(undefined);
      } catch (err) {
        console.error('Error closing socket:', err);
      }
    }
    this.sockets.clear();
  }
}

export const sessionManager = new SessionManager();
