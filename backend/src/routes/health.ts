import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

export const healthRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/health', async (_request, reply) => {
    const startTime = Date.now();
    let dbStatus = 'disconnected';
    let dbLatencyMs: number | null = null;
    let dbError: string | null = null;

    // Validate database reachability by executing a simple query
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbStatus = 'connected';
    } catch (err: unknown) {
      dbError = err instanceof Error ? err.message : 'Unknown database error';
      app.log.error({ err }, 'Database health check failed');
    }

    // In Phase 0, Redis is not installed yet; report as not configured per project requirements
    const redisStatus = env.REDIS_URL ? 'configured' : 'not configured';

    const overallOk = dbStatus === 'connected';

    return reply.status(overallOk ? 200 : 503).send({
      status: overallOk ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startTime,
      services: {
        backend: 'ok',
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          error: dbError,
        },
        redis: {
          status: redisStatus,
        },
      },
    });
  });
};
