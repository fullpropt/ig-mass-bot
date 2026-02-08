import axios from 'axios';
import ProxyAgent from 'proxy-agent';
import { randomUUID } from 'crypto';
import settings from './settings.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('proxy');

export class ProxyManager {
  constructor(proxies) {
    this.rawProxies = proxies || [];
    this.goodProxies = [];
    this.stickyMap = new Map();
  }

  async validateAll() {
    const tests = this.rawProxies.map((proxy) => this.validateProxy(proxy));
    const results = await Promise.allSettled(tests);
    this.goodProxies = results
      .map((res, idx) => (res.status === 'fulfilled' ? this.rawProxies[idx] : null))
      .filter(Boolean);
    logger.info({ total: this.rawProxies.length, ok: this.goodProxies.length }, 'Proxies validados');
  }

  async validateProxy(proxy) {
    if (!proxy) return false;
    const agent = new ProxyAgent(proxy);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await axios.get('https://www.instagram.com/', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 5000,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const ok = res.status === 200;
      if (!ok) throw new Error(`status ${res.status}`);
      return true;
    } catch (err) {
      clearTimeout(timer);
      logger.warn({ proxy, err: err.message }, 'Proxy reprovado');
      return false;
    }
  }

  getSticky(accountUsername) {
    if (!this.goodProxies.length) return undefined;
    if (this.stickyMap.has(accountUsername)) return this.stickyMap.get(accountUsername);
    const proxy = this.goodProxies[this.stickyMap.size % this.goodProxies.length];
    this.stickyMap.set(accountUsername, proxy);
    return proxy;
  }

  rotate(accountUsername, interval = settings.proxyRotationInterval) {
    if (!settings.useProxyRotation) return this.getSticky(accountUsername);
    if (!this.goodProxies.length) return this.getSticky(accountUsername);
    const current = this.stickyMap.get(accountUsername) || this.getSticky(accountUsername);
    const index = this.goodProxies.indexOf(current);
    const next = this.goodProxies[(index + 1 + this.goodProxies.length) % this.goodProxies.length];
    this.stickyMap.set(accountUsername, next);
    logger.info({ accountUsername, next }, 'Proxy rotacionado');
    return next;
  }

  assignBatch(accounts) {
    return accounts.map((acc, idx) => ({
      ...acc,
      proxy: this.goodProxies[idx % (this.goodProxies.length || 1)],
    }));
  }
}

export default ProxyManager;
