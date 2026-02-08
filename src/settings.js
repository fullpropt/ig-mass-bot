import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ensure = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
ensure(path.join(rootDir, 'sessions'));
ensure(path.join(rootDir, 'logs'));
ensure(path.join(rootDir, 'lists'));
ensure(path.join(rootDir, 'downloads'));

const settings = {
  rootDir,
  sessionsDir: path.join(rootDir, 'sessions'),
  logsDir: path.join(rootDir, 'logs'),
  listsDir: path.join(rootDir, 'lists'),
  targetsFile: process.env.TARGETS_FILE || './targets.txt',
  mediaListFile: process.env.MEDIA_LIST_FILE || './medias.txt',
  accountsFile: process.env.ACCOUNTS_FILE || './accounts.enc',
  proxiesFile: process.env.PROXIES_FILE || './proxies.txt',
  maxDmPerDay: Number(process.env.MAX_DM_PER_DAY || 60),
  delayMin: Number(process.env.DELAY_MIN || 35),
  delayMax: Number(process.env.DELAY_MAX || 95),
  hourlyActionLimit: Number(process.env.HOURLY_ACTION_LIMIT || 30),
  proxyRotationInterval: Number(process.env.PROXY_ROTATION_INTERVAL || 15),
  useProxyRotation: (process.env.USE_PROXY_ROTATION || 'true').toLowerCase() === 'true',
  checkOnline: (process.env.CHECK_ONLINE || 'false').toLowerCase() === 'true',
  port: Number(process.env.PORT || 3000),
  baseMessage: process.env.BASE_MESSAGE || 'Olá {nome}! Temos algo especial pra você: {link}',
  defaultLink: process.env.DEFAULT_LINK || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  createV2: (process.env.CREATE_V2 || 'true').toLowerCase() === 'true',
  maxCreationsPerHour: Number(process.env.MAX_CREATIONS_PER_HOUR || 2),
  captchaKey: process.env.CAPTCHA_API_KEY || '',
  tempMailUrl: process.env.TEMPMAIL_API_URL || '',
  tempMailToken: process.env.TEMPMAIL_API_TOKEN || '',
  passwordDefault: process.env.PASSWORD_DEFAULT || 'SenhaForte!123',
  accountsSecret: process.env.ACCOUNTS_SECRET || 'chave-secreta-32-bytes-exata-1234567890abcd',
  redisUrl: process.env.REDIS_URL || '',
  dryRun: (process.env.DRY_RUN || 'false').toLowerCase() === 'true',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    to: process.env.ALERT_EMAIL || ''
  }
};

export default settings;
