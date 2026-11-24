import { RedisOptions } from 'ioredis';

export const getRedisConnectionOptions = (): RedisOptions => {
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      const isTls = url.protocol === 'rediss:';
      return {
        host: url.hostname,
        port: Number(url.port) || (isTls ? 6379 : 6379),
        username: url.username || undefined,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        tls: isTls ? { rejectUnauthorized: false } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    } catch (err) {
      console.warn('[Redis] Failed to parse REDIS_URL, falling back to host/port config:', err);
    }
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
};

export const redisConnectionOptions: RedisOptions = getRedisConnectionOptions();

