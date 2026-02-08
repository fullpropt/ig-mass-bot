import { IgApiClient, IgCheckpointError, IgLoginRequiredError } from 'instagram-private-api';
import settings from './settings.js';
import { randomUserAgent } from './utils/uaPool.js';
import { createLogger } from './utils/logger.js';
import { saveSession, loadSession } from './state/sessionStore.js';

const loggerBase = createLogger('auth');

const buildClient = (username, proxy) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  ig.state.proxyUrl = proxy || undefined;
  const ua = randomUserAgent();
  if (ig.request?.defaults?.headers) ig.request.defaults.headers['User-Agent'] = ua;
  ig.state.userAgent = ua;
  return ig;
};

const handleChallenge = async (ig, username, logger) => {
  try {
    await ig.challenge.auto(true);
    await saveSession(username, await ig.state.serialize());
    logger.info({ username }, 'Challenge resolvido automaticamente');
  } catch (err) {
    logger.error({ err }, 'Challenge requer intervenção manual');
    throw err;
  }
};

export const loginWithCookie = async ({ username, cookie, proxy }, logger = loggerBase) => {
  const ig = buildClient(username, proxy);
  const parts = (cookie || '').split(';').map((c) => c.trim()).filter(Boolean);
  for (const p of parts) await ig.state.cookieJar.setCookie(p, 'https://i.instagram.com/');
  await ig.account.currentUser();
  await saveSession(username, await ig.state.serialize());
  logger.info({ username }, 'Login via cookie');
  return ig;
};

export const login = async ({
  username, password, proxy, cookie,
}, logger = loggerBase) => {
  const ig = buildClient(username, proxy);
  // 1) tenta sessão persistida (Redis/FS)
  const persisted = await loadSession(username);
  if (persisted) {
    await ig.state.deserialize(persisted);
    await ig.account.currentUser();
    logger.info({ username }, 'Sessão restaurada');
    return ig;
  }
  // 2) cookie explícito
  if (cookie) return loginWithCookie({ username, cookie, proxy }, logger);

  // 3) senha
  try {
    await ig.simulate.preLoginFlow();
    await ig.account.login(username, password);
    await ig.simulate.postLoginFlow();
    await saveSession(username, await ig.state.serialize());
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
      await saveSession(username, await ig.state.serialize());
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

export const refreshCookies = (ig, username, logger = loggerBase) => {
  setInterval(async () => {
    try {
      await ig.account.currentUser();
      await saveSession(username, await ig.state.serialize());
      logger.debug({ username }, 'Sessão renovada');
    } catch (err) {
      logger.warn({ err }, 'Falha ao renovar sessão');
    }
  }, 15 * 60 * 1000);
};

export const detectActionBlock = (error) => {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  if (error instanceof IgCheckpointError) return true;
  return msg.includes('feedback_required')
    || msg.includes('please wait a few minutes')
    || msg.includes('action blocked')
    || msg.includes('challenge_required');
};

export default { login, loginWithCookie, refreshCookies, detectActionBlock };
