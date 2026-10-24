import Fastify from 'fastify';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';

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

// Enable CORS headers for development communication with Vite frontend
app.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    return reply.status(204).send();
  }
});

// Register health routes (both /health and /api/health for direct access or proxying)
await app.register(healthRoutes);
await app.register(healthRoutes, { prefix: '/api' });

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server ready at http://${env.HOST === '0.0.0.0' ? 'localhost' : env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}. Shutting down gracefully...`);
  try {
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
