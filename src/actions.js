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
  const ext = path.extname(filePath || '').toLowerCase();
  const targetPath = path.isAbsolute(filePath) ? filePath : path.join(settings.rootDir, filePath);
  if (!fs.existsSync(targetPath)) return [];
  if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      const arr = [];
      fs.createReadStream(targetPath)
        .pipe(csv())
        .on('data', (row) => {
          const val = Object.values(row)[0];
          if (val) arr.push(val.trim());
        })
        .on('end', () => resolve(arr))
        .on('error', reject);
    });
  }
  const raw = fs.readFileSync(targetPath, 'utf-8');
  return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
};

export class ActionsRunner {
  constructor({ ig, username, logger = createLogger(`actions-${username}`) }) {
    this.ig = ig;
    this.username = username;
    this.logger = logger;
  }

  async massLike({ mediaListPath, limit = 50 }) {
    const ids = await loadList(mediaListPath || settings.targetsFile);
    const slice = ids.slice(0, limit);
    for (const mediaId of slice) {
      try {
        this.ig.request.defaults.headers['User-Agent'] = randomUserAgent();
        await this.ig.media.like({ mediaId });
        this.logger.info({ mediaId }, 'Like enviado');
      } catch (err) {
        this.logger.error({ mediaId, err }, 'Falha no like');
      }
      await wait(gaussian(3000, 10000));
    }
    return { processed: slice.length };
  }

  async massComment({ mediaListPath, template, limit = 20 }) {
    const ids = await loadList(mediaListPath || settings.targetsFile);
    const slice = ids.slice(0, limit);
    for (const mediaId of slice) {
      try {
        this.ig.request.defaults.headers['User-Agent'] = randomUserAgent();
        await this.ig.media.comment({ mediaId, text: template });
        this.logger.info({ mediaId }, 'Comentário enviado');
      } catch (err) {
        this.logger.error({ mediaId, err }, 'Falha no comentário');
      }
      await wait(gaussian(5000, 15000));
    }
    return { processed: slice.length };
  }
}

export default ActionsRunner;
