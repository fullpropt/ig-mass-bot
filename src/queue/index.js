import { Queue } from 'bullmq';
import Redis from 'ioredis';
import settings from '../settings.js';

const connection = new Redis(settings.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

export const dmQueue = new Queue('dm-queue', { connection });
export const signupQueue = new Queue('signup-queue', { connection });

export default { dmQueue, signupQueue, connection };
