import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import csv from 'csv-parser';
import settings from './settings.js';
import { randomUserAgent } from './utils/uaPool.js';
import hasConsent from './utils/consentChecker.js';
import { createLogger } from './utils/logger.js';
import { detectActionBlock } from './auth.js';

const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const gaussian = (min, max) => {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const normalized = Math.min(Math.max(num / 4 + 0.5, 0), 1);
  return Math.round(min + normalized * (max - min));
};
const applyTemplate = (template, data) => template.replace(/\{(\w+)\}/g, (_, k) => data[k] || '');
const spin = (text) => {
  const re = /\{([^{}]+?)\}/;
  let t = text;
  while (re.test(t)) {
    t = t.replace(re, (_, c) => {
      const parts = c.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
  }
  return t;
};

export class MassSender extends EventEmitter {
  constructor({ ig, username, proxyManager, logger = createLogger(username) }) {
    super();
    this.ig = ig;
    this.username = username;
    this.proxyManager = proxyManager;
    this.logger = logger;
    this.queue = [];
    this.stats = { sent: 0, failed: 0, blocked: 0, skipped: 0, queued: 0 };
    this.status = 'idle';
    this.dailyFile = path.join(settings.sessionsDir, `daily-${username}.json`);
    this.hourlyActions = 0;
    this.lastHour = new Date().getHours();
    this.stopFlag = false;
    this.cooldownUntil = null;
  }

  async loadRecipients(filePath) {
    const p = filePath || settings.targetsFile;
    const ext = path.extname(p || '').toLowerCase();
    const fp = path.isAbsolute(p) ? p : path.join(settings.rootDir, p);
    let users = [];
    if (ext === '.csv') {
      users = await new Promise((resolve, reject) => {
        const arr = [];
        fs.createReadStream(fp).pipe(csv()).on('data', (row) => {
          const val = Object.values(row)[0];
          if (val) arr.push(val.trim());
        }).on('end', () => resolve(arr)).on('error', reject);
      });
    } else {
      users = fs.readFileSync(fp, 'utf-8').split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
    }
    this.queue.push(...users);
    this.stats.queued = this.queue.length;
    return users.length;
  }

  loadDaily() {
    if (!fs.existsSync(this.dailyFile)) return { date: new Date().toDateString(), count: 0 };
    const data = JSON.parse(fs.readFileSync(this.dailyFile));
    if (data.date !== new Date().toDateString()) return { date: new Date().toDateString(), count: 0 };
    return data;
  }
  saveDaily(data) { fs.writeFileSync(this.dailyFile, JSON.stringify(data)); }
  resetHourly() { const h = new Date().getHours(); if (h !== this.lastHour) { this.hourlyActions = 0; this.lastHour = h; } }

  async sendAll({ template, link = settings.defaultLink, mediaPath }) {
    this.stopFlag = false;
    this.status = 'running';
    this.emit('status', this.status);
    const daily = this.loadDaily();

    while (this.queue.length && !this.stopFlag) {
      this.resetHourly();
      const now = Date.now();
      if (this.cooldownUntil && now < this.cooldownUntil) { await wait(this.cooldownUntil - now); continue; }
      if (daily.count >= settings.maxDmPerDay) { this.status = 'daily_limit'; break; }
      if (this.hourlyActions >= settings.hourlyActionLimit) { await wait(60 * 60 * 1000); continue; }

      const target = this.queue.shift();
      try {
        const userId = await this.ig.user.getIdByUsername(target);
        if (settings.checkOnline) {
          const info = await this.ig.user.info(userId);
          if (!info?.is_active) { this.stats.skipped += 1; continue; }
        }
        const consent = await hasConsent(this.ig, userId);
        if (!consent) { this.stats.blocked += 1; continue; }

        this.ig.request.defaults.headers['User-Agent'] = randomUserAgent();
        const thread = this.ig.entity.directThread([userId]);
        const msg = spin(applyTemplate(template, { nome: target, username: target, link }));
        if (settings.dryRun) {
          this.logger.info({ target }, `[dry-run] DM: ${msg}`);
        } else if (mediaPath) {
          const buf = fs.readFileSync(mediaPath);
          await thread.broadcastPhoto({ file: buf, caption: msg });
        } else {
          await thread.broadcastText(msg);
        }

        this.stats.sent += 1;
        this.hourlyActions += 1;
        daily.count += 1;
        this.saveDaily(daily);
      } catch (err) {
        if (detectActionBlock(err)) { this.cooldownUntil = Date.now() + (24 + Math.random() * 24) * 3600000; }
        this.stats.failed += 1;
        this.logger.error({ target, err }, 'Falha DM');
      }
      await wait(gaussian(settings.delayMin * 1000, settings.delayMax * 1000));
    }
    this.status = 'idle';
    this.emit('status', this.status);
    return this.stats;
  }

  stop() { this.stopFlag = true; this.status = 'stopped'; this.emit('status', this.status); }
  pause() { this.status = 'paused'; this.emit('status', this.status); }
  resume() { if (this.status === 'paused') { this.status = 'running'; this.emit('status', this.status); } }
}
export default MassSender;
