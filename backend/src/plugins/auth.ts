import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, TokenPayload } from '../lib/auth.js';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export const LOCAL_USER: TokenPayload = {
  userId: '00000000-0000-0000-0000-000000000000',
  email: 'local@device.lan',
};

/**
 * Authentication preHandler hook to protect routes.
 * When AUTH_ENABLED=false, this acts as a no-op and assigns a default local user.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // If authentication is disabled for local dev, assign default local user and pass through
  if (!env.AUTH_ENABLED) {
    request.user = LOCAL_USER;
    return;
  }

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
