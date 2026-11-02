import { prisma } from '../lib/prisma.js';
import { avatarStorage } from './avatarStorage.js';
import type { WASocket } from '@whiskeysockets/baileys';

export interface AvatarFetchJob {
  sessionId: string;
  jid: string;
  type: 'preview' | 'image';
  retries: number;
}

export type SocketProvider = (sessionId: string) => WASocket | undefined;

export class AvatarQueue {
  private queue: AvatarFetchJob[] = [];
  private processing = false;
  private queuedKeys = new Set<string>();
  private socketProvider: SocketProvider | null = null;
  private broadcaster: ((sessionId: string, jid: string, url: string) => void) | null = null;

  // Constants
  public readonly MIN_DELAY_MS = 2000;
  public readonly MAX_JITTER_MS = 1000;
  public readonly MAX_RETRIES = 2;
  public readonly SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  public setSocketProvider(provider: SocketProvider) {
    this.socketProvider = provider;
  }

  public setBroadcaster(fn: (sessionId: string, jid: string, url: string) => void) {
    this.broadcaster = fn;
  }

  /**
   * Determine whether an avatar needs fetching based on the 7-day rule,
   * current status, and file presence.
   */
  public async shouldFetchAvatar(
    sessionId: string,
    jid: string,
    forceRefresh = false,
  ): Promise<boolean> {
    if (forceRefresh) return true;

    const contact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid } },
    });

    if (!contact) return true;

    const now = Date.now();
    const lastUpdated = contact.profilePictureUpdatedAt ? contact.profilePictureUpdatedAt.getTime() : 0;
    const isWithinSevenDays = now - lastUpdated < this.SEVEN_DAYS_MS;

    // Rule: If marked none or hidden within the last 7 days, do not query WhatsApp again
    if (
      isWithinSevenDays &&
      (contact.profilePictureStatus === 'none' || contact.profilePictureStatus === 'hidden')
    ) {
      return false;
    }

    // Rule: If already ok, file exists on disk, and updated within 7 days, skip
    if (contact.profilePictureStatus === 'ok' && contact.profilePictureUrl && isWithinSevenDays) {
      const exists = await avatarStorage.avatarExists(contact.profilePictureUrl);
      if (exists) {
        return false;
      }
    }

    return true;
  }

  /**
   * Enqueue an avatar fetch request.
   * Enforces no-duplicate queueing and lazy processing.
   */
  public enqueue(sessionId: string, jid: string, type: 'preview' | 'image' = 'preview'): boolean {
    const key = `${sessionId}:${jid}:${type}`;
    if (this.queuedKeys.has(key)) {
      return false;
    }

    this.queuedKeys.add(key);
    this.queue.push({ sessionId, jid, type, retries: 0 });

    if (!this.processing) {
      this.processNext().catch((err) => {
        console.error('[AvatarQueue] Error in processNext:', err);
      });
    }

    return true;
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const job = this.queue.shift()!;
    const key = `${job.sessionId}:${job.jid}:${job.type}`;

    try {
      await this.executeJob(job);
    } catch (err) {
      console.error(`[AvatarQueue] Uncaught error processing avatar for ${job.jid}:`, err);
    } finally {
      this.queuedKeys.delete(key);

      // Enforce rate limiting: 2000ms base + 0-1000ms randomized jitter
      const delay = this.MIN_DELAY_MS + Math.floor(Math.random() * this.MAX_JITTER_MS);
      setTimeout(() => {
        this.processNext().catch(console.error);
      }, delay);
    }
  }

  private async executeJob(job: AvatarFetchJob): Promise<void> {
    const { sessionId, jid, type, retries } = job;

    if (!this.socketProvider) {
      return;
    }

    const sock = this.socketProvider(sessionId);
    if (!sock) {
      return;
    }

    try {
      // Fetch avatar URL from WhatsApp server
      const pictureUrl = await sock.profilePictureUrl(jid, type);

      if (!pictureUrl) {
        // No picture set
        await this.markAvatarStatus(sessionId, jid, 'none');
        return;
      }

      // Download binary image
      const res = await fetch(pictureUrl);
      if (!res.ok) {
        throw new Error(`Failed to download avatar image: HTTP ${res.status}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Save locally to storage/avatars/{sessionId}/{jid}.jpg
      const savedKey = await avatarStorage.saveAvatar(sessionId, jid, buffer, 'jpg');

      // Update Contact record in PostgreSQL
      await prisma.contact.upsert({
        where: { sessionId_jid: { sessionId, jid } },
        create: {
          sessionId,
          jid,
          profilePictureUrl: savedKey,
          profilePictureUpdatedAt: new Date(),
          profilePictureStatus: 'ok',
          isGroup: jid.endsWith('@g.us'),
        },
        update: {
          profilePictureUrl: savedKey,
          profilePictureUpdatedAt: new Date(),
          profilePictureStatus: 'ok',
        },
      });

      console.log(`[AvatarQueue] Successfully downloaded and stored avatar for ${jid}`);

      if (this.broadcaster) {
        this.broadcaster(sessionId, jid, savedKey);
      }
    } catch (err: unknown) {
      const errMsg = String(err);
      const isNotFound =
        errMsg.includes('item-not-found') ||
        errMsg.includes('404') ||
        errMsg.includes('not-authorized') ||
        errMsg.includes('401');

      if (isNotFound) {
        // WhatsApp says not found or not authorized (hidden profile picture)
        // Mark status as hidden and do NOT query for 7 days
        console.log(`[AvatarQueue] Avatar for ${jid} not accessible (hidden/none). Suppressing for 7 days.`);
        await this.markAvatarStatus(sessionId, jid, 'hidden');
        return;
      }

      // Network or socket transient error -> retry up to 2 times
      if (retries < this.MAX_RETRIES) {
        console.warn(`[AvatarQueue] Transient error fetching avatar for ${jid} (attempt ${retries + 1}/${this.MAX_RETRIES}). Requeuing...`);
        setTimeout(() => {
          this.queue.push({ sessionId, jid, type, retries: retries + 1 });
          if (!this.processing) {
            this.processNext().catch(console.error);
          }
        }, 5000);
      } else {
        console.error(`[AvatarQueue] Exceeded max retries for ${jid}. Marking as none.`);
        await this.markAvatarStatus(sessionId, jid, 'none');
      }
    }
  }

  private async markAvatarStatus(
    sessionId: string,
    jid: string,
    status: 'none' | 'hidden' | 'ok',
  ): Promise<void> {
    try {
      await prisma.contact.upsert({
        where: { sessionId_jid: { sessionId, jid } },
        create: {
          sessionId,
          jid,
          profilePictureStatus: status,
          profilePictureUpdatedAt: new Date(),
          isGroup: jid.endsWith('@g.us'),
        },
        update: {
          profilePictureStatus: status,
          profilePictureUpdatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[AvatarQueue] Error updating avatar status for ${jid}:`, err);
    }
  }
}

export const avatarQueue = new AvatarQueue();
