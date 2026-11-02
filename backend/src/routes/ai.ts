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
};
