import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { avatarStorage } from '../services/avatarStorage.js';

export const avatarRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /avatars/:sessionId/:jid
   * Streams the locally cached avatar image for a contact or group.
   * Emits HTTP caching headers (Cache-Control: public, max-age=604800, immutable) for fast local rendering.
   */
  app.get('/avatars/:sessionId/:jid', async (request, reply) => {
    const { sessionId, jid } = request.params as { sessionId: string; jid: string };

    const decodedJid = decodeURIComponent(jid);

    const contact = await prisma.contact.findUnique({
      where: {
        sessionId_jid: {
          sessionId,
          jid: decodedJid,
        },
      },
    });

    if (!contact || !contact.profilePictureUrl || contact.profilePictureStatus !== 'ok') {
      return reply
        .status(404)
        .header('Cache-Control', 'public, max-age=86400')
        .send({ error: 'Avatar not found or not available' });
    }

    const file = await avatarStorage.getAvatarStream(contact.profilePictureUrl);
    if (!file) {
      return reply
        .status(404)
        .header('Cache-Control', 'public, max-age=86400')
        .send({ error: 'Avatar file missing from disk' });
    }

    return reply
      .header('Content-Type', file.contentType)
      .header('Cache-Control', 'public, max-age=604800, immutable')
      .send(file.stream);
  });
};
