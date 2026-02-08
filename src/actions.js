import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import settings from './settings.js';
import { randomUserAgent } from './utils/uaPool.js';
import { createLogger } from './utils/logger.js';

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const gaussian = (min, max) => {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const normalized = Math.min(Math.max(num / 4 + 0.5, 0), 1);
  return Math.round(min + normalized * (max - min));
};

const loadList = async (filePath) => {
  const p = path.isAbsolute(filePath) ? filePath : path.join(settings.rootDir, filePath);
  if (!fs.existsSync(p)) return [];
  if (p.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      const arr = [];
      fs.createReadStream(p).pipe(csv()).on('data', (row) => {
        const val = Object.values(row)[0];
        if (val) arr.push(val.trim());
      }).on('end', () => resolve(arr)).on('error', reject);
    });
  }
  return fs.readFileSync(p, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
};

export class ActionsRunner {
  constructor({ ig, username, logger = createLogger(`actions-${username}`) }) {
    this.ig = ig;
    this.username = username;
    this.logger = logger;
  }

  async massLike({ mediaListPath = settings.mediaListFile, limit = 50 }) {
    const ids = await loadList(mediaListPath);
    const slice = ids.slice(0, limit);
    for (const mediaId of slice) {
      if (settings.dryRun) { this.logger.info({ mediaId }, '[dry-run] like'); continue; }
      try {
        this.ig.request.defaults.headers['User-Agent'] = randomUserAgent();
        await this.ig.media.like({ mediaId });
        this.logger.info({ mediaId }, 'Like enviado');
      } catch (err) { this.logger.error({ mediaId, err }, 'Falha like'); }
      await wait(gaussian(3000, 10000));
    }
  }

  async massComment({ mediaListPath = settings.mediaListFile, template, limit = 20 }) {
    const ids = await loadList(mediaListPath);
    const slice = ids.slice(0, limit);
    for (const mediaId of slice) {
      if (settings.dryRun) { this.logger.info({ mediaId }, '[dry-run] comment'); continue; }
      try {
        const msg = template;
        this.ig.request.defaults.headers['User-Agent'] = randomUserAgent();
        await this.ig.media.comment({ mediaId, text: msg });
        this.logger.info({ mediaId }, 'Comentário enviado');
      } catch (err) { this.logger.error({ mediaId, err }, 'Falha comment'); }
      await wait(gaussian(5000, 15000));
    }
  }

  async massReport({ userIds, reason = 'spam', count = 5 }) {
    const slice = userIds.slice(0, count);
    for (const uid of slice) {
      if (settings.dryRun) { this.logger.info({ uid }, '[dry-run] report'); continue; }
      try {
        await this.ig.user.report({ userId: uid, reason });
        this.logger.info({ uid }, 'Report enviado');
      } catch (err) { this.logger.error({ uid, err }, 'Falha report'); }
      await wait(gaussian(10000, 30000));
    }
  }
}

export default ActionsRunner;
