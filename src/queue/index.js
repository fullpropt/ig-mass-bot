import { Queue } from 'bullmq';
import Redis from 'ioredis';
import settings from '../settings.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('queue');

let connection = null;
let dmQueue;
let signupQueue;

const redisUrl = settings.redisUrl || process.env.REDIS_URL;

if (redisUrl) {
  connection = new Redis(redisUrl);
  dmQueue = new Queue('dm-queue', { connection });
  signupQueue = new Queue('signup-queue', { connection });
  log.info({ redisUrl }, 'BullMQ conectado');
} else {
  log.warn('REDIS_URL não definido – usando filas no-op (dashboard funciona, jobs não rodam)');
  const Dummy = class {
    async add() { return { id: 'noop' }; }
    on() {}
  };
  dmQueue = new Dummy();
  signupQueue = new Dummy();
}

export { dmQueue, signupQueue, connection };
export default { dmQueue, signupQueue, connection };
