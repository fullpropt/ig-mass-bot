import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import settings from '../settings.js';

const ALGO = 'aes-256-gcm';
const key = Buffer.from(settings.accountsSecret, 'utf-8');

const encrypt = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
};

const decrypt = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return dec;
};

export const saveAccounts = (accounts) => {
  const line = accounts.map((a) => `${a.username}:${a.password}:${a.email || ''}`).join('\n');
  const enc = encrypt(line);
  const file = path.isAbsolute(settings.accountsFile) ? settings.accountsFile : path.join(settings.rootDir, settings.accountsFile);
  fs.writeFileSync(file, enc, 'utf-8');
};

export const loadAccounts = () => {
  const file = path.isAbsolute(settings.accountsFile) ? settings.accountsFile : path.join(settings.rootDir, settings.accountsFile);
  if (!fs.existsSync(file)) return [];
  const content = decrypt(fs.readFileSync(file, 'utf-8'));
  return content.split(/\r?\n/).filter(Boolean).map((line) => {
    const [username, password, email] = line.split(':');
    return { username, password, email };
  });
};
