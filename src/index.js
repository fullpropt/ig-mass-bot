import settings from './settings.js';
import ProxyManager from './proxyManager.js';
import { login, loginWithCookie, refreshCookies } from './auth.js';
import { createLogger } from './utils/logger.js';
import MassSender from './massSender.js';
import ActionsRunner from './actions.js';
import { createAccountsBatch } from './accountCreator.js';
import startServer from './server.js';
import { loadAccounts, saveAccounts } from './utils/cryptoStore.js';
import fs from 'fs';
import path from 'path';

const coreLogger = createLogger('core');

const loadProxies = () => {
  const p = path.isAbsolute(settings.proxiesFile) ? settings.proxiesFile : path.join(settings.rootDir, settings.proxiesFile);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
};

class Bot {
  constructor(account, proxyManager) {
    this.username = account.username;
    this.password = account.password;
    this.email = account.email;
    this.cookie = account.cookie;
    this.proxyManager = proxyManager;
    this.proxy = proxyManager.getSticky(account.username);
    this.logger = createLogger(this.username);
    this.ig = null;
    this.massSender = null;
    this.actions = null;
    this.ready = false;
  }

  async init() {
    this.proxy = this.proxyManager.getSticky(this.username);
    if (this.cookie) this.ig = await loginWithCookie({ username: this.username, cookie: this.cookie, proxy: this.proxy }, this.logger);
    else this.ig = await login({ username: this.username, password: this.password, proxy: this.proxy }, this.logger);
    refreshCookies(this.ig, this.username, this.logger);
    this.massSender = new MassSender({ ig: this.ig, username: this.username, proxyManager: this.proxyManager, logger: this.logger });
    this.actions = new ActionsRunner({ ig: this.ig, username: this.username, logger: this.logger });
    this.ready = true;
    this.logger.info('Bot pronto');
  }
}

class BotManager {
  constructor() { this.bots = []; this.proxyManager = null; }

  async init() {
    this.proxyManager = new ProxyManager(loadProxies());
    await this.proxyManager.validateAll();
    const accounts = loadAccounts();
    for (const acc of accounts.slice(0, 150)) {
      const bot = new Bot(acc, this.proxyManager);
      try { await bot.init(); this.bots.push(bot); }
      catch (err) { coreLogger.error({ acc: acc.username, err }, 'Falha init'); }
    }
  }

  getBot(username) { return this.bots.find((b) => b.username === username); }

  async addBot({ username, password, proxy, cookie }) {
    const bot = new Bot({ username, password, cookie }, this.proxyManager);
    if (proxy) bot.proxyManager.goodProxies.unshift(proxy);
    await bot.init();
    this.bots.push(bot);
    const current = loadAccounts();
    saveAccounts([...current, { username, password, email: '' }]);
    return bot;
  }

  async createAndAddBatch(qty) {
    if (!settings.createV2) throw new Error('CREATE_V2 desligado');
    const created = await createAccountsBatch(qty, this.proxyManager.goodProxies);
    for (const acc of created) await this.addBot({ username: acc.username, password: acc.password });
    return created.length;
  }
}

(async () => {
  const manager = new BotManager();
  await manager.init();
  startServer(manager);
})();
