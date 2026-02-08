import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };
ensureDir(path.join(rootDir, 'sessions'));
ensureDir(path.join(rootDir, 'logs'));
ensureDir(path.join(rootDir, 'lists'));

const readLines = (filePath) => {
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
    if (!fs.existsSync(abs)) return [];
    return fs.readFileSync(abs, 'utf-8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch (err) {
    return [];
  }
};

const parseAccounts = (lines) => lines.map((line) => {
  const [username, password, email] = line.split(':');
  return { username, password, email };
});

const envAccounts = (process.env.ACCOUNTS || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((pair) => {
    const [username, password] = pair.split(':');
    return { username, password };
  });

const accountsFile = process.env.ACCOUNTS_FILE || './accounts.txt';
const accounts = parseAccounts(readLines(accountsFile));
const proxiesFile = process.env.PROXIES_FILE || './proxies.txt';
const proxies = readLines(proxiesFile);
const targetsFile = process.env.TARGETS_FILE || './targets.txt';

const settings = {
  rootDir,
  sessionsDir: path.join(rootDir, 'sessions'),
  logsDir: path.join(rootDir, 'logs'),
  listsDir: path.join(rootDir, 'lists'),
  accounts: accounts.length ? accounts : envAccounts,
  proxies,
  targetsFile,
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
  maxCreationsPerDay: Number(process.env.MAX_CREATIONS_PER_DAY || 5),
};

export default settings;
