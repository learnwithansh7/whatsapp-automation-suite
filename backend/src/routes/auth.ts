import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth, LOCAL_USER } from '../plugins/auth.js';
import { env } from '../config/env.js';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Check if first-time registration is available
  app.get('/auth/can-register', async () => {
    const userCount = await prisma.appUser.count();
    return { canRegister: userCount === 0 };
  });

  // Register the first administrator account (only allowed if no users exist)
  app.post('/auth/register', async (request, reply) => {
    const userCount = await prisma.appUser.count();
    if (userCount > 0) {
      return reply.status(403).send({
        error: 'Registration is closed. An administrator account already exists.',
      });
    }

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { email, password, name } = parsed.data;
    const passwordHash = await hashPassword(password);

    const user = await prisma.appUser.create({
      data: {
        email,
        passwordHash,
        name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    const token = signToken({ userId: user.id, email: user.email });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.status(201).send({ user });
  });

  // Login
  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.format(),
      });
    }

    const { email, password } = parsed.data;

    const user = await prisma.appUser.findUnique({
      where: { email },
    });

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = signToken({ userId: user.id, email: user.email });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  });

  // Logout
  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // Get currently authenticated user
  app.get('/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
    if (!env.AUTH_ENABLED) {
      return reply.send({
        user: {
          id: LOCAL_USER.userId,
          email: LOCAL_USER.email,
          name: 'Local User',
        },
      });
    }

    const user = await prisma.appUser.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      reply.clearCookie('token', { path: '/' });
      return reply.status(401).send({ error: 'User no longer exists' });
    }

    return reply.send({ user });
  });
};
