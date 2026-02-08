import fs from 'fs';
import path from 'path';
import settings from '../settings.js';
import MassSender from '../massSender.js';
import { login } from '../auth.js';
import { createLogger } from '../utils/logger.js';
import { loadAccounts } from '../utils/cryptoStore.js';

const logger = createLogger('sendDM');

export const sendDmJob = async (jobData) => {
  const {
    username, password, proxy, cookie, template, link, listPath, mediaPath,
  } = jobData;
  // tenta encontrar credenciais salvas
  const acc = loadAccounts().find((a) => a.username === username) || {};
  const ig = await login({
    username,
    password: password || acc.password,
    proxy,
    cookie,
  }, logger);

  const sender = new MassSender({
    ig,
    username,
    proxyManager: { rotate: () => proxy, getSticky: () => proxy },
    logger,
  });
  await sender.loadRecipients(listPath || settings.targetsFile);
  const stats = await sender.sendAll({ template, link: link || settings.defaultLink, mediaPath });
  return stats;
};

export default sendDmJob;
