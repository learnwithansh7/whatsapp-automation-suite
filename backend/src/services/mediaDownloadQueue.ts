import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { mediaStorage } from './mediaStorage.js';
import { generateThumbnail } from './thumbnailService.js';
import { downloadMediaMessage, WASocket, proto } from '@whiskeysockets/baileys';

export interface MediaDownloadJob {
  sessionId: string;
  chatJid: string;
  messageId: string;
  force?: boolean;
}

export interface MediaDownloadBroadcaster {
  onMediaDownloaded: (
    sessionId: string,
    chatJid: string,
    messageId: string,
    mediaPath: string,
    thumbnail?: string | null,
  ) => void;
  onMediaFailed: (sessionId: string, chatJid: string, messageId: string, error: string) => void;
}

export class MediaDownloadQueue {
  private queue: MediaDownloadJob[] = [];
  private queuedIds = new Set<string>();
  private processing = false;
  private socketProvider: ((sessionId: string) => WASocket | undefined) | null = null;
  private broadcaster: MediaDownloadBroadcaster | null = null;

  public setSocketProvider(fn: (sessionId: string) => WASocket | undefined) {
    this.socketProvider = fn;
  }

  public setBroadcaster(broadcaster: MediaDownloadBroadcaster) {
    this.broadcaster = broadcaster;
  }

  /**
   * Determine whether an incoming message should be downloaded automatically.
   */
  public shouldAutoDownload(type: string, mediaSize?: number | null): boolean {
    if (!['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
      return false;
    }

    if (type === 'video' && mediaSize) {
      const sizeMb = mediaSize / (1024 * 1024);
      if (sizeMb > env.AUTO_DOWNLOAD_VIDEO_MAX_MB) {
        return false;
      }
    }

    return true;
  }

  /**
   * Enqueue a media message for background download.
   */
  public enqueue(sessionId: string, chatJid: string, messageId: string, force = false): boolean {
    const key = `${sessionId}:${chatJid}:${messageId}`;
    if (this.queuedIds.has(key)) {
      return false;
    }

    this.queuedIds.add(key);
    this.queue.push({ sessionId, chatJid, messageId, force });

    if (!this.processing) {
      this.processNext().catch((err) => {
        console.error('[MediaDownloadQueue] Error in processNext:', err);
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
    const key = `${job.sessionId}:${job.chatJid}:${job.messageId}`;

    try {
      await this.executeJob(job);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[MediaDownloadQueue] Error downloading media for ${job.messageId}:`, errMsg);

      await prisma.message
        .updateMany({
          where: {
            sessionId: job.sessionId,
            chatJid: job.chatJid,
            id: job.messageId,
          },
          data: {
            mediaDownloadStatus: 'failed',
          },
        })
        .catch(() => {});

      if (this.broadcaster) {
        this.broadcaster.onMediaFailed(job.sessionId, job.chatJid, job.messageId, errMsg);
      }
    } finally {
      this.queuedIds.delete(key);

      // 500ms delay between media downloads to avoid bursting
      setTimeout(() => {
        this.processNext().catch(console.error);
      }, 500);
    }
  }

  private async executeJob(job: MediaDownloadJob): Promise<void> {
    const { sessionId, chatJid, messageId, force } = job;

    const message = await prisma.message.findUnique({
      where: {
        sessionId_chatJid_id: { sessionId, chatJid, id: messageId },
      },
    });

    if (!message || !message.raw) {
      return;
    }

    if (message.mediaDownloadStatus === 'done' && message.mediaPath && !force) {
      return;
    }

    const sock = this.socketProvider ? this.socketProvider(sessionId) : undefined;
    if (!sock) {
      return;
    }

    // Mark as pending
    await prisma.message.update({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
      data: { mediaDownloadStatus: 'pending' },
    });

    const rawMsg = message.raw as unknown as proto.IWebMessageInfo;

    // Download buffer from WhatsApp media server
    const buffer = await downloadMediaMessage(
      rawMsg,
      'buffer',
      {},
      {
        logger: sock.logger,
        reuploadRequest: (update) => sock.updateMediaMessage(update),
      },
    );

    if (!buffer || buffer.length === 0) {
      throw new Error('Downloaded empty media buffer');
    }

    // Save to disk
    const saved = await mediaStorage.saveMedia(
      sessionId,
      buffer,
      message.mediaFileName || undefined,
      message.mediaMime || undefined,
    );

    // Generate small thumbnail for images/videos
    let thumbnail: string | null = null;
    if (message.type === 'image' || message.type === 'video') {
      try {
        thumbnail = await generateThumbnail(buffer, message.type === 'video');
      } catch {
        // Thumbnail generation error is non-fatal
      }
    }

    // Update message row
    await prisma.message.update({
      where: { sessionId_chatJid_id: { sessionId, chatJid, id: messageId } },
      data: {
        mediaPath: saved.relativePath,
        mediaSize: saved.size,
        mediaDownloadStatus: 'done',
        ...(thumbnail ? { thumbnail } : {}),
      },
    });

    if (this.broadcaster) {
      this.broadcaster.onMediaDownloaded(
        sessionId,
        chatJid,
        messageId,
        saved.relativePath,
        thumbnail,
      );
    }
  }
}

export const mediaDownloadQueue = new MediaDownloadQueue();
