import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, TokenPayload } from '../lib/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

/**
 * Authentication preHandler hook to protect routes.
 * Reads token from httpOnly cookie or Authorization: Bearer header.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token =
    request.cookies?.token ||
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : null);

  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized: missing authentication token' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return reply.status(401).send({ error: 'Unauthorized: invalid or expired token' });
  }

  request.user = payload;
}
