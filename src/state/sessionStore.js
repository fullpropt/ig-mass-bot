import Redis from 'ioredis';
import settings from '../settings.js';
import fs from 'fs';
import path from 'path';

const redis = settings.redisUrl ? new Redis(settings.redisUrl) : null;

const fsDir = settings.sessionsDir;

export const saveSession = async (username, state) => {
  const json = JSON.stringify(state);
  if (redis) {
    await redis.set(`sess:${username}`, json);
  }
  fs.writeFileSync(path.join(fsDir, `${username}.json`), json);
};

export const loadSession = async (username) => {
  let json;
  if (redis) {
    json = await redis.get(`sess:${username}`);
    if (json) return JSON.parse(json);
  }
  const f = path.join(fsDir, `${username}.json`);
  if (fs.existsSync(f)) {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  }
  return null;
};

export default { saveSession, loadSession };
