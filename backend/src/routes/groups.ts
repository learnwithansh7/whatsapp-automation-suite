import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { groupService } from '../services/groupService.js';

export const groupRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /**
   * GET /api/sessions/:id/groups/:jid
   * Return metadata and participants with resolved names, avatars, and roles.
   */
  app.get('/sessions/:id/groups/:jid', async (request, reply) => {
    const { id: sessionId, jid } = request.params as { id: string; jid: string };
    const groupJid = decodeURIComponent(jid);

    // Fetch synced group details; if not in DB or outdated, triggers sync from WhatsApp socket
    let details = await groupService.getGroupDetails(sessionId, groupJid);
    if (!details || details.participants.length === 0) {
      details = await groupService.syncGroupMetadata(sessionId, groupJid);
    }

    if (!details) {
      return reply.status(404).send({ error: 'Group not found' });
    }

    return reply.send(details);
  });
};
