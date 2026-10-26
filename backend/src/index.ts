import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { sessionRoutes } from './routes/sessions.js';
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

// Register Rate Limiting plugin to protect authentication routes
await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
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

// Register Auth and Session routes under /api
await app.register(authRoutes, { prefix: '/api' });
await app.register(sessionRoutes, { prefix: '/api' });

// Setup Socket.IO on the underlying HTTP server
setupSocketIO(app.server);

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server ready at http://${env.HOST === '0.0.0.0' ? 'localhost' : env.HOST}:${env.PORT}`);

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
