import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { apiRoutes } from './routes/api.js';
import { startNotificationWorker } from './lib/queue.js';
import { startCronScheduler } from './services/scheduler.js';
import { prisma } from './lib/prisma.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url.replace(/authtoken=[a-zA-Z0-9_-]+/gi, 'authtoken=REDACTED'),
          hostname: req.hostname,
          remoteAddress: req.ip,
        };
      },
    },
  },
});

const start = async () => {
  try {
    // 1. CORS plugin
    await fastify.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret'],
    });

    // 2. Rate Limit plugin
    await fastify.register(rateLimit, {
      global: false, // selectively configured per route
    });

    // 3. Health check route
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        app: 'UEU Academic Radar API',
        timestamp: new Date().toISOString(),
      };
    });

    // 4. Register API routes (registration, dashboard, admin, webhooks)
    await fastify.register(apiRoutes);

    // 5. Start BullMQ background worker
    try {
      startNotificationWorker();
      console.log('[Queue] Notification worker initialized with 3-7s rate-limiting');
    } catch (err: any) {
      console.warn('[Queue] Could not start BullMQ worker (Redis might be offline):', err.message);
    }

    // 6. Start Cron Scheduler (every 3 hours)
    startCronScheduler();

    // 7. Listen server
    const port = Number(process.env.PORT) || 4000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 UEU Academic Radar API running on http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();
