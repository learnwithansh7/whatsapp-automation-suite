import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../plugins/auth.js';
import { sessionManager } from '../whatsapp/index.js';
import { mergeService } from '../whatsapp/mergeService.js';

const createSessionSchema = z.object({
  name: z.string().min(1, 'Session name is required').max(50),
});

const pairingCodeSchema = z.object({
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
});

export const sessionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Apply auth guard to all session routes
  app.addHook('preHandler', requireAuth);

  // POST /api/sessions - Create a new session record
  app.post('/sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const session = await prisma.session.create({
      data: {
        name: parsed.data.name,
        status: 'idle',
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
        lastConnectedAt: true,
        createdAt: true,
      },
    });

    return reply.status(201).send({ session });
  });

  // GET /api/sessions - List all sessions with merged runtime status
  app.get('/sessions', async () => {
    const dbSessions = await prisma.session.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        status: true,
        lastConnectedAt: true,
        lastDisconnectReason: true,
        createdAt: true,
      },
    });

    // Merge in-memory runtime status (live QR, active reconnect status)
    const sessions = dbSessions.map((s) => {
      const runtime = sessionManager.getStatus(s.id);
      const isRunning = sessionManager.getSocket(s.id) !== undefined;
      const effectiveStatus = isRunning
        ? (runtime.status !== 'idle' ? runtime.status : s.status)
        : (s.status === 'qr' || s.status === 'connecting' || s.status === 'reconnecting' ? 'idle' : s.status);

      return {
        ...s,
        status: effectiveStatus,
        phoneNumber: runtime.phoneNumber || s.phoneNumber,
        lastConnectedAt: runtime.lastConnectedAt || s.lastConnectedAt,
        qr: runtime.qr || null,
      };
    });

    return { sessions };
  });

  // POST /api/sessions/:id/connect - Trigger QR / connection flow
  app.post<{ Params: { id: string } }>('/sessions/:id/connect', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Start Baileys session in background
    sessionManager.startSession(id).catch((err) => {
      app.log.error({ err, sessionId: id }, 'Failed to start session from connect API');
    });

    const status = sessionManager.getStatus(id);
    return reply.send({
      message: 'Connection initiated',
      status: status.status,
      qr: status.qr || null,
    });
  });

  // POST /api/sessions/:id/pairing-code - Request phone pairing code
  app.post<{ Params: { id: string } }>('/sessions/:id/pairing-code', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const parsed = pairingCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    try {
      const code = await sessionManager.requestPairingCode(id, parsed.data.phoneNumber);
      return reply.send({ code });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate pairing code';
      return reply.status(500).send({ error: message });
    }
  });

  // POST /api/sessions/:id/disconnect - Stop socket cleanly without wiping credentials
  app.post<{ Params: { id: string } }>('/sessions/:id/disconnect', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    await sessionManager.stopSession(id);
    return reply.send({ message: 'Session disconnected', status: 'idle' });
  });

  // POST /api/sessions/:id/logout - Logout from WhatsApp and wipe credentials
  app.post<{ Params: { id: string }; Body?: { deleteData?: boolean } }>(
    '/sessions/:id/logout',
    async (request, reply) => {
      const { id } = request.params;
      const deleteData = !!request.body?.deleteData;

      const result = await sessionManager.logoutSession(id, deleteData);
      return reply.send({
        message: result.message,
        status: 'logged_out',
        remoteLogoutSuccess: result.remoteLogoutSuccess,
      });
    },
  );

  // POST /api/sessions/:id/reset - Wipe stale credentials and start fresh QR flow
  app.post<{ Params: { id: string } }>('/sessions/:id/reset', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    await sessionManager.resetSession(id);
    return reply.send({ message: 'Session reset. Generating fresh QR code...', status: 'connecting' });
  });

  // POST /api/sessions/:id/backfill - Merge duplicate chats and refresh display names
  app.post<{ Params: { id: string } }>('/sessions/:id/backfill', async (request, reply) => {
    const { id } = request.params;

    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const result = await mergeService.backfillSession(id);
    return reply.send({
      message: 'Backfill completed',
      mergedChats: result.mergedChats,
      updatedChats: result.updatedChats,
    });
  });
};
