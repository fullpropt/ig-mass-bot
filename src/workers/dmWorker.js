import { Worker } from 'bullmq';
import { dmQueue, connection } from '../queue/index.js';
import { sendDmJob } from '../bot/sendDM.js';
import limiter from '../anti/limiter.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('dmWorker');

if (process.env.KILL_SWITCH === 'true') {
  logger.warn('KILL_SWITCH=true, encerrando dmWorker');
  process.exit(0);
}

new Worker('dm-queue', async (job) => {
  return limiter.wrap(async () => sendDmJob(job.data))();
}, {
  connection,
  concurrency: 1,
});

dmQueue.on('failed', (job, err) => logger.error({ jobId: job.id, err }, 'DM job failed'));
dmQueue.on('completed', (job) => logger.info({ jobId: job.id }, 'DM job completed'));
