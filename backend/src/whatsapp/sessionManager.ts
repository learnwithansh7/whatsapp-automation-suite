import makeWASocket, {
  fetchLatestBaileysVersion,
  Browsers,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma.js';
import { usePrismaAuthState } from './authState.js';
import { calculateBackoff, classifyDisconnectReason } from './backoff.js';
import { ingestionService } from './ingestionService.js';
import { mapMessageStatus } from './messageParser.js';
import { avatarQueue } from '../services/avatarQueue.js';
import { mergeService } from './mergeService.js';
import { sendQueue } from '../services/sendQueue.js';
import { mediaDownloadQueue } from '../services/mediaDownloadQueue.js';
import { groupService } from '../services/groupService.js';
import { aiResponderService } from '../services/aiResponderService.js';
import { getIO } from '../lib/io.js';
import { env } from '../config/env.js';

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
  | { type: 'qr'; sessionId: string; qr: string }
  | { type: 'presence'; sessionId: string; chatJid: string; presences: unknown };

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

  constructor() {
    avatarQueue.setSocketProvider((sessionId: string) => this.getSocket(sessionId));
    sendQueue.setSocketProvider((sessionId: string) => this.getSocket(sessionId));
    mediaDownloadQueue.setSocketProvider((sessionId: string) => this.getSocket(sessionId));
    groupService.setSocketProvider((sessionId: string) => this.getSocket(sessionId));
    aiResponderService.setSocketGetter((sessionId: string) => this.getSocket(sessionId) || null);
  }

  public getSocket(sessionId: string): WASocket | undefined {
    return this.sockets.get(sessionId);
  }

  /**
   * Send typing / presence update to WhatsApp server for a chat.
   */
  public async sendPresence(
    sessionId: string,
    chatJid: string,
    state: 'composing' | 'recording' | 'paused',
  ): Promise<void> {
    const sock = this.sockets.get(sessionId);
    if (!sock) return;
    try {
      await sock.sendPresenceUpdate(state, chatJid);
    } catch (err) {
      console.warn(`[SessionManager:${sessionId}] Failed to send presence update to ${chatJid}:`, err);
    }
  }

  /**
   * Subscribe to presence updates for a specific chat (e.g. when opened by user).
   */
  public async subscribePresence(sessionId: string, chatJid: string): Promise<void> {
    const sock = this.sockets.get(sessionId);
    if (!sock) return;
    try {
      await sock.presenceSubscribe(chatJid);
    } catch (err) {
      console.warn(`[SessionManager:${sessionId}] Failed to subscribe to presence for ${chatJid}:`, err);
    }
  }

  /**
   * Mark chat as read locally, and optionally send WhatsApp read receipt (blue tick).
   */
  public async markChatRead(
    sessionId: string,
    chatJid: string,
    sendReceipt = false,
  ): Promise<void> {
    await prisma.chat.update({
      where: { sessionId_jid: { sessionId, jid: chatJid } },
      data: { unreadCount: 0, markedUnread: false },
    });

    if (sendReceipt || env.SEND_READ_RECEIPTS) {
      const sock = this.sockets.get(sessionId);
      if (!sock) return;

      try {
        const unreadMessages = await prisma.message.findMany({
          where: {
            sessionId,
            chatJid,
            fromMe: false,
            status: { in: ['delivered', 'sent'] },
          },
          select: { id: true, senderJid: true },
          take: 50,
        });

        if (unreadMessages.length > 0) {
          const keys = unreadMessages.map((m) => ({
            remoteJid: chatJid,
            id: m.id,
            participant: m.senderJid || undefined,
            fromMe: false,
          }));

          await sock.readMessages(keys);
        }
      } catch (err) {
        console.warn(`[SessionManager:${sessionId}] Error sending read receipts to WhatsApp:`, err);
      }
    }
  }

  /**
   * Fetch group metadata from WhatsApp and sync subject and participants to DB.
   */
  public async fetchGroupMetadata(sessionId: string, groupJid: string): Promise<void> {
    try {
      await groupService.syncGroupMetadata(sessionId, groupJid);
    } catch (err) {
      console.warn(`[SessionManager:${sessionId}] Failed to fetch group metadata for ${groupJid}:`, err);
    }
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

    if (this.getStatus(sessionId).status !== 'reconnecting') {
      this.retryCounts.set(sessionId, 0);
    }

    const sessionLogger = this.baseLogger.child({ sessionId });
    this.updateStatus(sessionId, 'connecting');

    try {
      const { state, saveCreds } = await usePrismaAuthState(sessionId, sessionLogger);
      let version: [number, number, number] | undefined;
      try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
      } catch (e) {
        console.warn(`[SessionManager:${sessionId}] Failed to fetch latest Baileys version, using default:`, e);
      }

      const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: state,
        logger: sessionLogger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
      });

      this.sockets.set(sessionId, sock);

      // Listen for credentials updates and save to database
      sock.ev.on('creds.update', saveCreds);

      // Listen for messages upsert (incoming & outgoing)
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(
          `[Baileys:messages.upsert] Received ${messages?.length || 0} messages (type: ${type}) for session ${sessionId}`,
        );
        for (const msg of messages) {
          try {
            await ingestionService.ingestMessage(sessionId, msg, false);
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error ingesting message:`, err);
          }
        }
      });

      // Listen for message status updates (sent, delivered, read)
      sock.ev.on('messages.update', async (updates) => {
        console.log(
          `[Baileys:messages.update] Received ${updates?.length || 0} message updates for session ${sessionId}`,
        );
        for (const u of updates) {
          try {
            const chatJid = u.key.remoteJid;
            const msgId = u.key.id;
            if (!chatJid || !msgId) continue;
            if (u.update.status !== undefined && u.update.status !== null) {
              const status = mapMessageStatus(u.update.status);
              await ingestionService.updateMessageStatus(sessionId, chatJid, msgId, status);
            }
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error updating message status:`, err);
          }
        }
      });

      // Listen for historical sync (WhatsApp initial pairing sync)
      sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest, progress, syncType }) => {
        console.log(
          `[Baileys:messaging-history.set] Received history sync for session ${sessionId}: ` +
            `chats=${chats?.length || 0}, contacts=${contacts?.length || 0}, messages=${messages?.length || 0}, ` +
            `isLatest=${isLatest ?? false}, syncType=${syncType ?? 'standard'}, progress=${progress ?? 'N/A'}`,
        );
        try {
          await ingestionService.ingestHistorySync(sessionId, {
            chats: chats as Array<{ id: string; name?: string | null; unreadCount?: number | null }>,
            contacts: contacts as Array<{ id: string; name?: string | null; notify?: string | null }>,
            messages,
            progress,
          });
        } catch (err) {
          console.error(`[SessionManager:${sessionId}] Error during messaging-history.set:`, err);
        }
      });

      // Listen for contacts upsert & update
      sock.ev.on('contacts.upsert', async (contacts) => {
        console.log(
          `[Baileys:contacts.upsert] Received ${contacts?.length || 0} contacts for session ${sessionId}`,
        );
        for (const c of contacts) {
          try {
            await ingestionService.upsertContact(sessionId, c);
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error in contacts.upsert:`, err);
          }
        }
      });

      sock.ev.on('contacts.update', async (contacts) => {
        console.log(
          `[Baileys:contacts.update] Received ${contacts?.length || 0} contact updates for session ${sessionId}`,
        );
        for (const c of contacts) {
          try {
            if (c.id) {
              await ingestionService.upsertContact(sessionId, c as { id: string; name?: string; notify?: string });
            }
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error in contacts.update:`, err);
          }
        }
      });

      // Listen for chats upsert & update
      sock.ev.on('chats.upsert', async (chats) => {
        console.log(
          `[Baileys:chats.upsert] Received ${chats?.length || 0} chats for session ${sessionId}`,
        );
        for (const ch of chats) {
          try {
            await ingestionService.ensureChat(sessionId, ch.id, ch.name);
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error in chats.upsert:`, err);
          }
        }
      });

      sock.ev.on('chats.update', async (chats) => {
        console.log(
          `[Baileys:chats.update] Received ${chats?.length || 0} chat updates for session ${sessionId}`,
        );
        for (const ch of chats) {
          try {
            if (!ch.id) continue;
            await ingestionService.ensureChat(sessionId, ch.id, ch.name);

            const updateData: Record<string, unknown> = {};

            // Handle Pin updates from WhatsApp phone
            if ('pin' in ch && ch.pin !== undefined) {
              const pinVal = typeof ch.pin === 'number' ? ch.pin : Number(ch.pin);
              const isPinned = !isNaN(pinVal) && pinVal > 0;
              updateData.isPinned = isPinned;
              updateData.pinnedAt = isPinned ? new Date(pinVal * 1000) : null;
            }

            // Handle Archive updates from WhatsApp phone
            if ('archived' in ch && ch.archived !== undefined) {
              updateData.isArchived = Boolean(ch.archived);
              updateData.archivedAt = ch.archived ? new Date() : null;
            }

            // Handle Mute updates from WhatsApp phone
            if ('mute' in ch && ch.mute !== undefined) {
              const muteVal = typeof ch.mute === 'number' ? ch.mute : Number(ch.mute);
              const isMuted = !isNaN(muteVal) && (muteVal > 0 || muteVal === -1);
              updateData.isMuted = isMuted;
              updateData.mutedUntil = isMuted
                ? (muteVal === -1 ? new Date('2099-12-31T23:59:59.999Z') : new Date(muteVal))
                : null;
            }

            // Handle Unread count updates from WhatsApp phone
            if ('unreadCount' in ch && typeof ch.unreadCount === 'number') {
              updateData.unreadCount = ch.unreadCount;
              if (ch.unreadCount === 0) {
                updateData.markedUnread = false;
              }
            }

            if (Object.keys(updateData).length > 0) {
              const updated = await prisma.chat.update({
                where: { sessionId_jid: { sessionId, jid: ch.id } },
                data: updateData,
              });

              getIO()?.to(`session:${sessionId}`).emit('chat.updated', {
                sessionId,
                chat: updated,
              });
            }
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error in chats.update:`, err);
          }
        }
      });

      // Listen for message reactions (incoming & updates)
      sock.ev.on('messages.reaction', async (reactionUpdates) => {
        console.log(
          `[Baileys:messages.reaction] Received ${reactionUpdates?.length || 0} reaction updates for session ${sessionId}`,
        );
        for (const r of reactionUpdates) {
          try {
            await ingestionService.ingestReaction(sessionId, r);
          } catch (err) {
            console.error(`[SessionManager:${sessionId}] Error in messages.reaction:`, err);
          }
        }
      });

      // Listen for group participant changes
      sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        console.log(
          `[Baileys:group-participants.update] group=${id}, action=${action}, count=${participants?.length || 0} for session ${sessionId}`,
        );
        try {
          await ingestionService.updateGroupParticipants(sessionId, id, participants, action);
          await groupService.syncGroupMetadata(sessionId, id).catch(() => {});
        } catch (err) {
          console.error(`[SessionManager:${sessionId}] Error in group-participants.update:`, err);
        }
      });

      // Listen for group upserts
      sock.ev.on('groups.upsert', async (groups) => {
        console.log(`[Baileys:groups.upsert] Received ${groups?.length || 0} groups for session ${sessionId}`);
        for (const g of groups) {
          if (g.id) {
            await groupService.syncGroupMetadata(sessionId, g.id).catch(() => {});
          }
        }
      });

      // Listen for group metadata changes (subject, description, announce)
      sock.ev.on('groups.update', async (groupUpdates) => {
        console.log(
          `[Baileys:groups.update] Received ${groupUpdates?.length || 0} group updates for session ${sessionId}`,
        );
        for (const gu of groupUpdates) {
          if (gu.id) {
            try {
              await groupService.syncGroupMetadata(sessionId, gu.id).catch(() => {});
            } catch (err) {
              console.error(`[SessionManager:${sessionId}] Error updating group metadata:`, err);
            }
          }
        }
      });

      // Listen for presence updates (typing, recording, online)
      sock.ev.on('presence.update', ({ id, presences }) => {
        this.emit({ type: 'presence', sessionId, chatJid: id, presences });
      });

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

          // Run backfill to merge duplicate LID/phone chats on connect
          mergeService.backfillSession(sessionId).catch((err) => {
            console.error(`[SessionManager:${sessionId}] Error running backfill on connect:`, err);
          });

          // Process queued outgoing messages that were waiting for reconnection
          sendQueue.processQueue(sessionId).catch((err) => {
            console.error(`[SessionManager:${sessionId}] Error processing send queue on connect:`, err);
          });
        }

        if (connection === 'close') {
          console.error(`[SessionManager:${sessionId}] Connection close error:`, lastDisconnect?.error);
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
              // If unlinked/pairing session timed out waiting for QR scan (status 408)
              const sessionDb = await prisma.session.findUnique({
                where: { id: sessionId },
                select: { encryptedCreds: true },
              });
              const isUnlinked = !sessionDb?.encryptedCreds;

              if (isUnlinked && statusCode === 408) {
                console.log(`[SessionManager:${sessionId}] Pairing QR code timed out waiting for scan. Resetting to idle.`);
                this.retryCounts.set(sessionId, 0);
                this.updateStatus(sessionId, 'idle', {
                  lastDisconnectReason: 'QR code expired. Click "Connect WhatsApp" to generate a fresh QR.',
                  qr: null,
                });
                break;
              }

              const currentRetries = (this.retryCounts.get(sessionId) || 0) + 1;
              this.retryCounts.set(sessionId, currentRetries);

              if (currentRetries > 5) {
                console.log(
                  `[SessionManager:${sessionId}] Connection failed 5 times in a row (${reasonText}). Halting reconnection retries.`,
                );
                this.updateStatus(sessionId, 'error', {
                  lastDisconnectReason: `Connection lost (${reasonText}). Reconnection failed after 5 attempts. Stale credentials or session disconnected.`,
                  qr: null,
                });
                break;
              }

              const delay = calculateBackoff(currentRetries);

              this.updateStatus(sessionId, 'reconnecting', {
                lastDisconnectReason: `${reasonText} (Attempt ${currentRetries}/5)`,
                qr: null,
              });

              console.log(
                `[SessionManager:${sessionId}] Connection closed (${reasonText}). Reconnecting in ${delay}ms (attempt #${currentRetries}/5)...`,
              );

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
    this.retryCounts.set(sessionId, 0);

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
   * Completely idempotent and resilient to socket/network failure.
   */
  public async logoutSession(sessionId: string, deleteData = false): Promise<{
    success: boolean;
    remoteLogoutSuccess: boolean;
    message: string;
  }> {
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
    }
    this.retryCounts.set(sessionId, 0);

    const sock = this.sockets.get(sessionId);
    let remoteLogoutSuccess = false;
    if (sock) {
      try {
        // Attempt sock.logout() with a strict 5-second timeout
        await Promise.race([
          sock.logout(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timed out')), 5000)),
        ]);
        remoteLogoutSuccess = true;
      } catch (err) {
        console.warn(`[SessionManager:${sessionId}] Remote sock.logout() timed out or failed (ignoring for local wipe):`, err);
      }
      try {
        sock.end(undefined);
      } catch {
        // ignore socket close errors
      }
      this.sockets.delete(sessionId);
    }

    // Always perform local database wipe
    await this.wipeCredentials(sessionId, deleteData);

    this.updateStatus(sessionId, 'logged_out', {
      phoneNumber: null,
      lastDisconnectReason: 'Explicitly logged out by user',
      qr: null,
    });

    this.emit({
      type: 'status',
      sessionId,
      status: 'logged_out',
      phoneNumber: null,
      error: null,
    });

    const msg = remoteLogoutSuccess
      ? 'Logged out'
      : 'Logged out locally (WhatsApp was unreachable)';

    return {
      success: true,
      remoteLogoutSuccess,
      message: msg,
    };
  }

  /**
   * Reset session: stops any running socket and reconnect timers, wipes stale credentials from DB,
   * resets retry counts, and triggers a fresh QR generation flow immediately.
   */
  public async resetSession(sessionId: string): Promise<void> {
    if (this.reconnectTimers.has(sessionId)) {
      clearTimeout(this.reconnectTimers.get(sessionId)!);
      this.reconnectTimers.delete(sessionId);
    }
    this.retryCounts.set(sessionId, 0);

    const sock = this.sockets.get(sessionId);
    if (sock) {
      try {
        sock.end(undefined);
      } catch {
        // Socket closed
      }
      this.sockets.delete(sessionId);
    }

    await this.wipeCredentials(sessionId, false);
    this.updateStatus(sessionId, 'idle', {
      phoneNumber: null,
      lastDisconnectReason: null,
      qr: null,
    });

    // Start fresh session to generate a clean pairing QR code
    await this.startSession(sessionId);
  }

  private async wipeCredentials(sessionId: string, deleteData = false): Promise<void> {
    try {
      if (deleteData) {
        // Delete all associated conversation and contact data
        await prisma.$transaction([
          prisma.message.deleteMany({ where: { sessionId } }),
          prisma.chat.deleteMany({ where: { sessionId } }),
          prisma.contact.deleteMany({ where: { sessionId } }),
          prisma.outbox.deleteMany({ where: { sessionId } }),
          prisma.groupParticipant.deleteMany({ where: { sessionId } }),
          prisma.authKey.deleteMany({ where: { sessionId } }),
          prisma.session.updateMany({
            where: { id: sessionId },
            data: {
              encryptedCreds: null,
              phoneNumber: null,
              status: 'logged_out',
            },
          }),
        ]);

        // Clean up media directory on disk if it exists
        const mediaDir = path.join(process.cwd(), 'storage', 'media', sessionId);
        await fs.promises.rm(mediaDir, { recursive: true, force: true }).catch(() => {});
      } else {
        // Keep chats and messages intact, only wipe auth keys and credentials
        await prisma.$transaction([
          prisma.authKey.deleteMany({ where: { sessionId } }),
          prisma.session.updateMany({
            where: { id: sessionId },
            data: {
              encryptedCreds: null,
              phoneNumber: null,
              status: 'logged_out',
            },
          }),
        ]);
      }
    } catch (err) {
      console.error(`[SessionManager:${sessionId}] Error wiping credentials:`, err);
    }
  }

  /**
   * Automatically restart all sessions with stored credentials on backend boot,
   * or auto-start the primary session so a pairing QR code is immediately available.
   */
  public async initAutoStart(): Promise<void> {
    try {
      const allSessions = await prisma.session.findMany({
        orderBy: { createdAt: 'asc' },
      });

      console.log(`[SessionManager] Checking ${allSessions.length} existing WhatsApp sessions on boot...`);
      for (let i = 0; i < allSessions.length; i++) {
        const session = allSessions[i];
        if (session.encryptedCreds) {
          console.log(`[SessionManager] Auto-starting authenticated session ${session.name} (${session.id})...`);
          this.startSession(session.id).catch((err) => {
            console.error(`[SessionManager] Failed to auto-start session ${session.id}:`, err);
          });
        } else if (i === 0) {
          // Auto-start primary unlinked session for immediate QR code display
          console.log(`[SessionManager] Auto-starting unlinked primary session ${session.name} (${session.id}) for QR code generation...`);
          this.startSession(session.id).catch((err) => {
            console.error(`[SessionManager] Failed to auto-start unlinked session ${session.id}:`, err);
          });
        }
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
