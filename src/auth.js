import fs from 'fs';
import path from 'path';
import {
  IgApiClient,
  IgCheckpointError,
  IgLoginRequiredError,
} from 'instagram-private-api';
import settings from './settings.js';
import { randomUserAgent } from './utils/uaPool.js';
import { createLogger } from './utils/logger.js';

const sessionsDir = settings.sessionsDir;

const serializeSession = async (ig, username) => {
  const state = await ig.state.serialize();
  fs.writeFileSync(path.join(sessionsDir, `${username}.json`), JSON.stringify(state));
};

const loadSession = async (ig, username) => {
  const file = path.join(sessionsDir, `${username}.json`);
  if (!fs.existsSync(file)) return false;
  await ig.state.deserialize(JSON.parse(fs.readFileSync(file)));
  return true;
};

const buildClient = (username, proxy) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  ig.state.proxyUrl = proxy || undefined;
  ig.request.defaults.headers['User-Agent'] = randomUserAgent();
  return ig;
};

const handleChallenge = async (ig, username, logger) => {
  try {
    await ig.challenge.auto(true);
    await serializeSession(ig, username);
    logger.info({ username }, 'Challenge resolvido automaticamente');
  } catch (err) {
    logger.error({ err }, 'Challenge requer intervenção manual');
    throw err;
  }
};

export const login = async (
  {
    username, password, proxy, cookie,
  },
  logger = createLogger(username),
) => {
  const ig = buildClient(username, proxy);
  try {
    // 1) Usa sessão salva se existir
    if (await loadSession(ig, username)) {
      await ig.account.currentUser();
      logger.info({ username }, 'Sessão restaurada');
      return ig;
    }

    // 2) Tenta cookie se fornecido
    if (cookie) {
      const parts = cookie.split(';').map((c) => c.trim()).filter(Boolean);
      for (const p of parts) await ig.state.cookieJar.setCookie(p, 'https://i.instagram.com/');
      await ig.account.currentUser(); // valida cookie
      await serializeSession(ig, username);
      logger.info({ username }, 'Login via cookie');
      return ig;
    }

    // 3) Senha
    await ig.simulate.preLoginFlow();
    await ig.account.login(username, password);
    await ig.simulate.postLoginFlow();
    await serializeSession(ig, username);
    logger.info({ username }, 'Login via senha');
    return ig;
  } catch (err) {
    if (err instanceof IgCheckpointError || String(err.message).includes('challenge_required')) {
      await handleChallenge(ig, username, logger);
      return ig;
    }
    if (err instanceof IgLoginRequiredError || String(err.message).includes('login_required')) {
      logger.warn({ username }, 'Sessão inválida, tentando relogar');
      await ig.account.login(username, password);
      await serializeSession(ig, username);
      return ig;
    }
    if (String(err.message).includes('429')) {
      logger.warn({ username }, 'Rate limit (429). Pausando 1h');
      await new Promise((r) => setTimeout(r, 60 * 60 * 1000));
    }
    logger.error({ err }, 'Falha no login');
    throw err;
  }
};

export const refreshCookies = (ig, username, logger = createLogger(username)) => {
  setInterval(async () => {
    try {
      await ig.account.currentUser();
      await serializeSession(ig, username);
      logger.debug({ username }, 'Sessão renovada');
    } catch (err) {
      logger.warn({ err }, 'Falha ao renovar sessão');
    }
  }, 15 * 60 * 1000);
};

export default { login, refreshCookies };
