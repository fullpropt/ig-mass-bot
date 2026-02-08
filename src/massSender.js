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

const loadBlacklist = (username) => {
  const file = path.join(settings.sessionsDir, `blacklist-${username}.json`);
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file)));
};

const saveBlacklist = (username, set) => {
  const file = path.join(settings.sessionsDir, `blacklist-${username}.json`);
  fs.writeFileSync(file, JSON.stringify([...set]));
};

const randomGaussian = (min, max) => {
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  const normalized = Math.min(Math.max(num / 4 + 0.5, 0), 1);
  return Math.round(min + normalized * (max - min));
};

const applyTemplate = (template, data) => template.replace(/\{(\w+)\}/g, (_, key) => data[key] || '');

const applySpintax = (text) => {
  const regex = /\{([^{}]+?)\}/;
  let result = text;
  while (regex.test(result)) {
    result = result.replace(regex, (match, choices) => {
      const parts = choices.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
  }
  return result;
};

const defaultStats = () => ({ sent: 0, failed: 0, blocked: 0, skipped: 0, queued: 0 });

export class MassSender extends EventEmitter {
  constructor({ ig, username, proxyManager, assignedProxy, logger = createLogger(username) }) {
    super();
    this.ig = ig;
    this.username = username;
    this.proxyManager = proxyManager;
    this.assignedProxy = assignedProxy;
    this.logger = logger;
    this.blacklist = loadBlacklist(username);
    this.queue = [];
    this.stats = defaultStats();
    this.status = 'idle';
    this.dailyFile = path.join(settings.sessionsDir, `daily-${username}.json`);
    this.hourlyActions = 0;
    this.lastHour = new Date().getHours();
    this.batchCounter = 0;
    this.stopFlag = false;
    this.cooldownUntil = null;
  }

  async loadRecipients(filePath) {
    const ext = path.extname(filePath || '').toLowerCase();
    let users = [];
    const targetPathRaw = filePath || settings.targetsFile;
    const targetPath = path.isAbsolute(targetPathRaw) ? targetPathRaw : path.join(settings.rootDir, targetPathRaw);
    if (!targetPath) return 0;
    if (ext === '.csv') {
      users = await new Promise((resolve, reject) => {
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
    } else {
      const raw = fs.readFileSync(targetPath, 'utf-8');
      users = raw.split(/\r?\n/).map((u) => u.trim()).filter(Boolean);
    }
    this.queue.push(...users);
    this.stats.queued = this.queue.length;
    return users.length;
  }

  loadDailyCount() {
    try {
      if (!fs.existsSync(this.dailyFile)) return { date: new Date().toDateString(), count: 0 };
      const data = JSON.parse(fs.readFileSync(this.dailyFile));
      if (data.date !== new Date().toDateString()) return { date: new Date().toDateString(), count: 0 };
      return data;
    } catch (err) {
      return { date: new Date().toDateString(), count: 0 };
    }
  }

  saveDailyCount(data) {
    fs.writeFileSync(this.dailyFile, JSON.stringify(data));
  }

  resetHourlyIfNeeded() {
    const hour = new Date().getHours();
    if (hour !== this.lastHour) {
      this.hourlyActions = 0;
      this.lastHour = hour;
    }
  }

  async sendAll({ template, link = settings.defaultLink, mediaPath }) {
    this.stopFlag = false;
    this.status = 'running';
    this.emit('status', this.status);
    const daily = this.loadDailyCount();

    while (this.queue.length && !this.stopFlag) {
      while (this.status === 'paused' && !this.stopFlag) {
        await wait(1000);
      }
      if (this.stopFlag) break;
      this.resetHourlyIfNeeded();
      const now = Date.now();
      if (this.cooldownUntil && now < this.cooldownUntil) {
        const waitMs = this.cooldownUntil - now;
        this.logger.warn({ waitMs }, 'Em cooldown por action block');
        await wait(waitMs);
        continue;
      }
      if (daily.count >= settings.maxDmPerDay) {
        this.logger.warn({ username: this.username }, 'Limite diário atingido');
        this.status = 'daily_limit';
        break;
      }
      if (this.hourlyActions >= settings.hourlyActionLimit) {
        this.logger.warn({ username: this.username }, 'Limite horário atingido, aguardando 1h');
        await wait(60 * 60 * 1000);
        continue;
      }

      const target = this.queue.shift();
      if (this.blacklist.has(target)) {
        this.stats.skipped += 1;
        continue;
      }

      try {
        const userId = await this.ig.user.getIdByUsername(target);
        if (settings.checkOnline) {
          const info = await this.ig.user.info(userId);
          if (!info?.is_active) {
            this.logger.info({ target }, 'Usuário offline, pulando');
            this.stats.skipped += 1;
            continue;
          }
        }

        const consent = await hasConsent(this.ig, userId);
        if (!consent) {
          this.logger.info({ target }, 'Sem consentimento prévio, bloqueado');
          this.stats.blocked += 1;
          this.blacklist.add(target);
          saveBlacklist(this.username, this.blacklist);
          continue;
        }

        await this.rotateIfNeeded();

        const thread = this.ig.entity.directThread([userId]);
        const message = applySpintax(applyTemplate(template, {
          nome: target.split('.')[0] || target,
          username: target,
          link,
        }));

        if (mediaPath) {
          const buffer = fs.readFileSync(mediaPath);
          await thread.broadcastPhoto({ file: buffer, caption: message });
        } else {
          await thread.broadcastText(message);
        }

        this.blacklist.add(target);
        saveBlacklist(this.username, this.blacklist);
        this.stats.sent += 1;
        this.hourlyActions += 1;
        daily.count += 1;
        this.saveDailyCount(daily);
        this.emit('progress', { ...this.stats, current: target });
        this.logger.info({ target }, 'DM enviada');
      } catch (err) {
        if (detectActionBlock(err)) {
          const hours = 24 + Math.floor(Math.random() * 24);
          this.cooldownUntil = Date.now() + hours * 60 * 60 * 1000;
          this.status = 'cooldown';
          this.logger.error({ target, hours }, 'Action block: entrando em cooldown');
        }
        this.stats.failed += 1;
        this.logger.error({ target, err }, 'Falha ao enviar');
      }

      if (this.stopFlag) break;
      const delay = randomGaussian(settings.delayMin * 1000, settings.delayMax * 1000);
      await wait(delay);
    }

    this.status = this.stopFlag ? 'stopped' : 'idle';
    this.emit('status', this.status);
    return this.stats;
  }

  pause() {
    this.status = 'paused';
    this.emit('status', this.status);
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.emit('status', this.status);
    }
  }

  stop() {
    this.stopFlag = true;
    this.status = 'stopped';
    this.emit('status', this.status);
  }

  async rotateIfNeeded() {
    this.batchCounter += 1;
    if (settings.useProxyRotation && this.batchCounter % settings.proxyRotationInterval === 0 && this.proxyManager) {
      const proxy = this.proxyManager.rotate(this.username);
      if (proxy) this.ig.state.proxyUrl = proxy;
    }
    // rotaciona UA sempre
    this.ig.state.userAgent = randomUserAgent();
  }
}

export default MassSender;
