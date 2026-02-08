import fs from 'fs';
import path from 'path';
import pino from 'pino';
import settings from '../settings.js';

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
ensureDir(settings.logsDir);

export const createLogger = (name = 'core') => {
  const filepath = path.join(settings.logsDir, `${name}.log`);
  const stream = pino.destination({ dest: filepath, sync: false });
  return pino({ level: settings.logLevel, base: { name } }, stream);
};

const defaultLogger = createLogger('core');
export default defaultLogger;
