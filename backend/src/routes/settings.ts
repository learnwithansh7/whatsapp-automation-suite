import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/auth.js';
import { getIO } from '../lib/io.js';

const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  chatWallpaper: z.enum(['plain', 'subtle', 'soft']).optional(),
  enterToSend: z.boolean().optional(),
  sendReadReceipts: z.boolean().optional(),
  showLinkPreviews: z.boolean().optional(),
  antiRevokeEnabled: z.boolean().optional(),
});

export const DEFAULT_SETTINGS = {
  theme: 'light',
  density: 'comfortable',
  chatWallpaper: 'plain',
  enterToSend: true,
  sendReadReceipts: false,
  showLinkPreviews: true,
  antiRevokeEnabled: true,
};

async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += await getDirSize(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        size += stat.size;
      }
    }
  } catch {
    // Directory might not exist yet
  }
  return size;
}

export const settingsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/settings
   * Returns merged settings from AppSetting table with sensible defaults.
   */
  app.get('/settings', async (_request, reply) => {
    const stored = await prisma.appSetting.findMany({
      where: { sessionId: 'global' },
    });

    const settings = { ...DEFAULT_SETTINGS };
    for (const s of stored) {
      if (s.key in settings) {
        (settings as Record<string, unknown>)[s.key] = s.value;
      }
    }

    return reply.send({ settings });
  });

  /**
   * PUT /api/settings
   * Update one or more settings in the database and broadcast via Socket.IO.
   */
  app.put('/settings', async (request, reply) => {
    const parsed = updateSettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const updates = parsed.data;
    const entries = Object.entries(updates);

    for (const [key, value] of entries) {
      if (value !== undefined) {
        await prisma.appSetting.upsert({
          where: { sessionId_key: { sessionId: 'global', key } },
          create: {
            sessionId: 'global',
            key,
            value: value as unknown as object,
          },
          update: {
            value: value as unknown as object,
          },
        });
      }
    }

    // Fetch updated settings
    const stored = await prisma.appSetting.findMany({
      where: { sessionId: 'global' },
    });
    const finalSettings = { ...DEFAULT_SETTINGS };
    for (const s of stored) {
      if (s.key in finalSettings) {
        (finalSettings as Record<string, unknown>)[s.key] = s.value;
      }
    }

    getIO()?.emit('settings.updated', { settings: finalSettings });

    return reply.send({ success: true, settings: finalSettings });
  });

  /**
   * GET /api/settings/storage-stats
   * Compute directory sizes for media, avatars, and link preview images, plus counts.
   */
  app.get('/settings/storage-stats', async (_request, reply) => {
    const storageDir = path.resolve(process.cwd(), 'storage');
    const mediaDir = path.join(storageDir, 'media');
    const avatarsDir = path.join(storageDir, 'avatars');
    const previewsDir = path.join(storageDir, 'previews');

    const [mediaBytes, avatarsBytes, previewsBytes, totalMessages, totalChats, outboxCount] = await Promise.all([
      getDirSize(mediaDir),
      getDirSize(avatarsDir),
      getDirSize(previewsDir),
      prisma.message.count(),
      prisma.chat.count(),
      prisma.outbox.count({ where: { status: { in: ['queued', 'sending'] } } }),
    ]);

    const toMB = (bytes: number) => Number((bytes / (1024 * 1024)).toFixed(2));

    return reply.send({
      mediaMB: toMB(mediaBytes),
      avatarsMB: toMB(avatarsBytes),
      previewsMB: toMB(previewsBytes),
      totalStorageMB: toMB(mediaBytes + avatarsBytes + previewsBytes),
      totalMessages,
      totalChats,
      outboxCount,
      appVersion: '0.4.2',
      baileysVersion: '6.7.24',
      nodeVersion: process.version,
    });
  });

  /**
   * POST /api/settings/clear-cache
   * Clears cached avatars and link preview files/records.
   */
  app.post('/settings/clear-cache', async (_request, reply) => {
    const storageDir = path.resolve(process.cwd(), 'storage');
    const avatarsDir = path.join(storageDir, 'avatars');
    const previewsDir = path.join(storageDir, 'previews');

    try {
      // Clear avatars directory files
      const avatarFiles = await fs.readdir(avatarsDir).catch(() => []);
      for (const f of avatarFiles) {
        await fs.unlink(path.join(avatarsDir, f)).catch(() => {});
      }

      // Clear previews directory files
      const previewFiles = await fs.readdir(previewsDir).catch(() => []);
      for (const f of previewFiles) {
        await fs.unlink(path.join(previewsDir, f)).catch(() => {});
      }

      // Reset contact picture status and delete cached link previews in DB
      await Promise.all([
        prisma.contact.updateMany({
          data: {
            profilePictureStatus: 'none',
            profilePictureUrl: null,
            profilePictureUpdatedAt: null,
          },
        }),
        prisma.linkPreview.deleteMany({}),
      ]);

      return reply.send({ success: true, message: 'Cached avatars and link previews cleared successfully' });
    } catch (err: unknown) {
      console.error('[Settings] Clear cache failed:', err);
      return reply.status(500).send({ error: 'Failed to clear cache' });
    }
  });
};
