import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
import { chatRoutes } from './routes/chats.js';
import { avatarRoutes } from './routes/avatars.js';
import { messageRoutes } from './routes/messages.js';
import { groupRoutes } from './routes/groups.js';
import { settingsRoutes } from './routes/settings.js';
import { linkPreviewRoutes } from './routes/linkPreview.js';
import { aiRoutes } from './routes/ai.js';
import { setupSocketIO } from './lib/socket.js';
import { sessionManager } from './whatsapp/index.js';

// Initialize Fastify with pino logger configured for readable dev output
const app = Fastify({
  logger:
    env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
});

// Register Cookie plugin for httpOnly authentication tokens
await app.register(fastifyCookie);

// Allow empty bodies for application/json requests
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, {});
      return;
    }
    const json = JSON.parse(body as string);
    done(null, json);
  } catch (err) {
    done(err as Error, undefined);
  }
});

// Register Rate Limiting plugin to protect authentication routes
await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

// Register Multipart plugin for file uploads (up to 100MB for documents)
await app.register(fastifyMultipart, {
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// Enable CORS headers with credentials for Vite dev server communication
app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin || 'http://localhost:5173';
  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Credentials', 'true');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

  if (request.method === 'OPTIONS') {
    return reply.status(204).send();
  }
});

// Register Health routes
await app.register(healthRoutes);
await app.register(healthRoutes, { prefix: '/api' });

// Register Auth, Session, Chat, Avatar, and Message routes under /api
await app.register(authRoutes, { prefix: '/api' });
await app.register(sessionRoutes, { prefix: '/api' });
await app.register(chatRoutes, { prefix: '/api' });
await app.register(avatarRoutes, { prefix: '/api' });
await app.register(messageRoutes, { prefix: '/api' });
await app.register(groupRoutes, { prefix: '/api' });
await app.register(settingsRoutes, { prefix: '/api' });
await app.register(linkPreviewRoutes, { prefix: '/api' });
await app.register(aiRoutes, { prefix: '/api' });

// Setup Socket.IO on the underlying HTTP server
setupSocketIO(app.server);

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    if (!env.AUTH_ENABLED) {
      app.log.warn('AUTH DISABLED - local development only');
    }
    app.log.info(`Server ready at http://${env.HOST}:${env.PORT}`);

    // Auto-start active WhatsApp sessions that have saved credentials
    await sessionManager.initAutoStart();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}. Shutting down sessions and HTTP server...`);
  try {
    await sessionManager.shutdownAll();
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
