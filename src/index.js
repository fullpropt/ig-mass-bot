import settings from './settings.js';
import ProxyManager from './proxyManager.js';
import { login, loginWithCookie, refreshCookies, createAccount } from './auth.js';
import { createLogger } from './utils/logger.js';
import MassSender from './massSender.js';
import startServer from './server.js';
import ActionsRunner from './actions.js';

const coreLogger = createLogger('core');

const shouldCreate = (process.env.CREATE_ON_START || 'false').toLowerCase() === 'true';

const warmUp = async (ig, username, logger = coreLogger) => {
  try {
    const timeline = ig.feed.timeline();
    const items = await timeline.items();
    const slice = items.slice(0, 5 + Math.floor(Math.random() * 5));
    for (const item of slice) {
      try {
        await ig.media.like({ mediaId: item.id, moduleInfo: { module_name: 'profile' } });
        await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
      } catch (err) {
        logger.warn({ err }, `Warm-up like falhou @${username}`);
      }
    }
    logger.info({ username, count: slice.length }, 'Warm-up concluído (likes leves)');
  } catch (err) {
    logger.warn({ err }, 'Warm-up não executado');
  }
};

const createAccountsIfEnabled = async (proxyManager) => {
  if (!shouldCreate) return;
  const limit = settings.maxCreationsPerDay;
  const slice = settings.accounts.slice(0, limit);
  coreLogger.warn({ limit }, 'Criação automática experimental habilitada (pode falhar / violar ToS)');
  for (const acc of slice) {
    try {
      const proxy = proxyManager.getSticky(acc.username);
      const { ig } = await createAccount({ username: acc.username, password: acc.password, email: acc.email, proxy });
      await warmUp(ig, acc.username, coreLogger); // warm-up após criação
    } catch (err) {
      coreLogger.error({ err, acc: acc.username }, 'Falha ao criar conta');
    }
  }
};

class Bot {
  constructor(account, proxyManager) {
    this.username = account.username;
    this.password = account.password;
    this.cookie = account.cookie;
    this.email = account.email;
    this.proxyManager = proxyManager;
    this.proxy = proxyManager.getSticky(account.username);
    this.logger = createLogger(this.username);
    this.ig = null;
    this.massSender = null;
    this.ready = false;
    this.autoReplyInterval = null;
  }

  async init() {
    this.proxy = this.proxyManager.getSticky(this.username);
    if (this.cookie) {
      this.ig = await loginWithCookie({ username: this.username, cookie: this.cookie, proxy: this.proxy }, this.logger);
    } else {
      this.ig = await login({ username: this.username, password: this.password, proxy: this.proxy }, this.logger);
    }
    refreshCookies(this.ig, this.username, this.logger);
    this.massSender = new MassSender({ ig: this.ig, username: this.username, proxyManager: this.proxyManager, assignedProxy: this.proxy, logger: this.logger });
    this.actions = new ActionsRunner({ ig: this.ig, username: this.username, logger: this.logger });
    this.startAutoReply();
    await warmUp(this.ig, this.username, this.logger);
    this.startWarmupSchedule();
    this.ready = true;
    this.logger.info('Bot pronto');
  }

  startAutoReply() {
    const replyText = 'Recebemos sua mensagem! Responderemos em breve (opt-in).';
    const seenThreads = new Set();
    this.autoReplyInterval = setInterval(async () => {
      try {
        const inbox = await this.ig.feed.directInbox().items();
        for (const thread of inbox) {
          if (seenThreads.has(thread.thread_id)) continue;
          seenThreads.add(thread.thread_id);
          const items = thread.items || [];
          const last = items[0];
          const fromMe = last?.user_id?.toString() === thread?.users?.[0]?.pk?.toString();
          if (!fromMe) {
            await this.ig.entity.directThread(thread.thread_id).broadcastText(replyText);
            this.logger.info({ thread: thread.thread_id }, 'Auto-reply enviado');
          }
        }
      } catch (err) {
        this.logger.error({ err }, 'Erro no auto-reply');
      }
    }, 60 * 1000);
  }

  startWarmupSchedule() {
    // light interactions every 12h to keep account warm
    setInterval(() => warmUp(this.ig, this.username, this.logger), 12 * 60 * 60 * 1000);
  }
}

class BotManager {
  constructor(proxyManager) {
    this.proxyManager = proxyManager;
    this.bots = [];
  }

  async init() {
    const accounts = settings.accounts.slice(0, 150);
    for (let i = 0; i < accounts.length; i += 1) {
      const account = accounts[i];
      const bot = new Bot(account, this.proxyManager);
      try {
        await bot.init();
        this.bots.push(bot);
      } catch (err) {
        coreLogger.error({ err, account: account.username }, 'Falha ao iniciar bot');
      }
    }
  }

  getBot(username) {
    return this.bots.find((b) => b.username === username);
  }

  async addBot({ username, password, proxy, cookie }) {
    const bot = new Bot({ username, password, cookie }, this.proxyManager);
    if (proxy) bot.proxyManager.goodProxies.unshift(proxy);
    await bot.init();
    this.bots.push(bot);
    return bot;
  }
}

(async () => {
  const proxyManager = new ProxyManager(settings.proxies);
  await proxyManager.validateAll();

  await createAccountsIfEnabled(proxyManager);

  const manager = new BotManager(proxyManager);
  await manager.init();

  startServer(manager);
})();
