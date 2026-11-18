import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { aiResponderService } from '../services/aiResponderService.js';
import { getIO } from '../lib/io.js';

const updateAiConfigSchema = z.object({
  isEnabled: z.boolean().optional(),
  minDelaySec: z.number().int().min(5).max(30).optional(),
  maxDelaySec: z.number().int().min(5).max(45).optional(),
  cooldownMin: z.number().int().min(0).max(180).optional(),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  developerBio: z.string().max(1000).nullable().optional(),
  youtubeUrl: z.string().max(300).nullable().optional(),
  youtubeSubs: z.string().max(50).nullable().optional(),
  instagramUrl: z.string().max(300).nullable().optional(),
  googleMeetMessage: z.string().max(1000).nullable().optional(),
  fallbackMessage: z.string().max(1000).nullable().optional(),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/sessions/:sessionId/ai/config
   * Fetch AI auto-reply configuration, daily count, and recent activity logs.
   */
  app.get('/sessions/:sessionId/ai/config', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const config = await aiResponderService.getConfig(sessionId);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [todayCount, totalEnabledChats, recentLogs] = await Promise.all([
      prisma.aiReplyLog.count({
        where: { sessionId, createdAt: { gte: oneDayAgo } },
      }),
      prisma.chat.count({
        where: { sessionId, aiEnabled: true, isArchived: false },
      }),
      prisma.aiReplyLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return reply.send({
      config,
      stats: {
        todayCount,
        dailyLimit: config.dailyLimit,
        totalEnabledChats,
      },
      recentLogs,
    });
  });

  /**
   * PUT /api/sessions/:sessionId/ai/config
   * Update AI bio, social links, human delay thresholds, and limits.
   */
  app.put('/sessions/:sessionId/ai/config', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const parsed = updateAiConfigSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const updated = await aiResponderService.updateConfig(sessionId, parsed.data);

    getIO()?.to(`session:${sessionId}`).emit('ai.config.updated', {
      sessionId,
      config: updated,
    });

    return reply.send({ success: true, config: updated });
  });

  /**
   * POST /api/sessions/:sessionId/ai/test
   * Simulate and test AI intent matching and reply generation without sending a real WhatsApp message.
   */
  app.post('/sessions/:sessionId/ai/test', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { text } = (request.body || {}) as { text?: string };

    if (!text || typeof text !== 'string') {
      return reply.status(400).send({ error: 'Text prompt is required' });
    }

    const config = await aiResponderService.getConfig(sessionId);
    const { replyText, intent } = aiResponderService.detectIntentAndGenerateReply(text, config);
    const typingDurationSec = Math.round(Math.min(6.5, Math.max(2.5, (replyText.length * 40) / 1000)) * 10) / 10;

    return reply.send({
      prompt: text,
      intent,
      replyText,
      readingDelaySec: `${config.minDelaySec}-${config.maxDelaySec}s`,
      typingDurationSec: `${typingDurationSec}s`,
      estimatedTotalSec: `${config.minDelaySec + Math.round(typingDurationSec)}-${config.maxDelaySec + Math.round(typingDurationSec)}s`,
    });
  });

  /**
   * POST /api/sessions/:sessionId/ai/enable-all
   * Enable AI auto-reply for all 1-on-1 direct chats (strictly excludes groups and broadcast).
   */
  app.post('/sessions/:sessionId/ai/enable-all', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const result = await prisma.chat.updateMany({
      where: {
        sessionId,
        type: 'private',
        NOT: { jid: { in: ['status@broadcast'] } },
      },
      data: { aiEnabled: true },
    });

    getIO()?.to(`session:${sessionId}`).emit('ai.chats.bulk-updated', {
      sessionId,
      enabled: true,
      count: result.count,
    });

    return reply.send({ success: true, count: result.count });
  });

  /**
   * POST /api/sessions/:sessionId/ai/disable-all
   * Disable AI auto-reply for all chats.
   */
  app.post('/sessions/:sessionId/ai/disable-all', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const result = await prisma.chat.updateMany({
      where: { sessionId },
      data: { aiEnabled: false },
    });

    getIO()?.to(`session:${sessionId}`).emit('ai.chats.bulk-updated', {
      sessionId,
      enabled: false,
      count: result.count,
    });

    return reply.send({ success: true, count: result.count });
  });
};
