import { prisma } from '../lib/prisma.js';
import type { WASocket } from '@whiskeysockets/baileys';

class AboutService {
  private lastFetchTime = 0;
  private minIntervalMs = 2500; // at most 1 fetch per 2.5 seconds
  private pendingFetches = new Map<string, Promise<string | null>>();

  /**
   * Lazily gets or fetches a contact's WhatsApp About text.
   * Caches for 7 days in the database.
   */
  public async getOrFetchAbout(
    sessionId: string,
    jid: string,
    getSocket: () => WASocket | null,
  ): Promise<string | null> {
    if (!jid || jid.endsWith('@g.us')) return null;

    // Check if already in DB and fresh within 7 days
    const contact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid } },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    if (contact?.aboutUpdatedAt && contact.aboutUpdatedAt >= sevenDaysAgo) {
      return contact.aboutText;
    }

    // Deduplicate in-flight fetch for the same contact
    const cacheKey = `${sessionId}:${jid}`;
    if (this.pendingFetches.has(cacheKey)) {
      return this.pendingFetches.get(cacheKey)!;
    }

    const fetchPromise = this.performFetch(sessionId, jid, getSocket).finally(() => {
      this.pendingFetches.delete(cacheKey);
    });

    this.pendingFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async performFetch(
    sessionId: string,
    jid: string,
    getSocket: () => WASocket | null,
  ): Promise<string | null> {
    const sock = getSocket();
    if (!sock) return null;

    // Respect 2.5s rate limit between consecutive fetchStatus calls
    const now = Date.now();
    const timeSinceLast = now - this.lastFetchTime;
    if (timeSinceLast < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - timeSinceLast));
    }
    this.lastFetchTime = Date.now();

    try {
      const res = await sock.fetchStatus(jid);
      let aboutText: string | null = null;

      if (res && Array.isArray(res) && res.length > 0) {
        const item = res[0] as { id?: string; status?: unknown };
        if (typeof item.status === 'string') {
          aboutText = item.status;
        } else if (item.status && typeof item.status === 'object' && 'status' in item.status) {
          aboutText = String((item.status as { status: unknown }).status || '');
        }
      }

      await prisma.contact.upsert({
        where: { sessionId_jid: { sessionId, jid } },
        create: {
          sessionId,
          jid,
          aboutText: aboutText || null,
          aboutUpdatedAt: new Date(),
        },
        update: {
          aboutText: aboutText || null,
          aboutUpdatedAt: new Date(),
        },
      });

      return aboutText;
    } catch (err: unknown) {
      // WhatsApp refused, contact has privacy enabled, or network error
      console.warn(`[AboutService] Failed or refused fetchStatus for ${jid}:`, (err as Error).message);
      // Mark aboutUpdatedAt so we do not retry immediately
      await prisma.contact.updateMany({
        where: { sessionId, jid },
        data: {
          aboutUpdatedAt: new Date(),
        },
      });
      return null;
    }
  }
}

export const aboutService = new AboutService();
