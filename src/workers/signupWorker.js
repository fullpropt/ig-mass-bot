import { Worker } from 'bullmq';
import { signupQueue, connection } from '../queue/index.js';
import { createAccountsBatch } from '../accountCreator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('signupWorker');

if (process.env.KILL_SWITCH === 'true') {
  logger.warn('KILL_SWITCH=true, encerrando signupWorker');
  process.exit(0);
}

new Worker('signup-queue', async (job) => {
  const { qty, proxies } = job.data;
  return createAccountsBatch(qty || 1, proxies || []);
}, {
  connection,
  concurrency: 1,
});

signupQueue.on('failed', (job, err) => logger.error({ jobId: job.id, err }, 'Signup job failed'));
signupQueue.on('completed', (job, res) => logger.info({ jobId: job.id, res }, 'Signup job completed'));
