import fs from 'fs';
import path from 'path';
import { IgApiClient, IgCheckpointError } from 'instagram-private-api';
import settings from './settings.js';
import { randomUserAgent } from './utils/uaPool.js';
import { createLogger } from './utils/logger.js';

const serializeSession = async (ig, username) => {
  const state = await ig.state.serialize();
  const filePath = path.join(settings.sessionsDir, `${username}.json`);
  fs.writeFileSync(filePath, JSON.stringify(state));
};

const loadSession = async (ig, username) => {
  const filePath = path.join(settings.sessionsDir, `${username}.json`);
  if (!fs.existsSync(filePath)) return false;
  const saved = JSON.parse(fs.readFileSync(filePath));
  await ig.state.deserialize(saved);
  return true;
};

export const buildClient = (username, proxy) => {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  ig.state.proxyUrl = proxy || undefined;
  ig.state.appUserAgent = randomUserAgent();
  ig.state.userAgent = ig.state.appUserAgent;
  return ig;
};

export const login = async ({ username, password, proxy }, logger = createLogger(username)) => {
  const ig = buildClient(username, proxy);
  try {
    const loaded = await loadSession(ig, username);
    if (loaded) {
      logger.info({ username }, 'Sessão carregada');
      return ig;
    }
    const logged = await ig.account.login(username, password);
    await serializeSession(ig, username);
    logger.info({ username, pk: logged.pk }, 'Login ok e sessão salva');
    return ig;
  } catch (err) {
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
      logger.warn({ err }, 'Erro ao renovar sessão');
    }
  }, 1000 * 60 * 15);
};

// Experimental: criação de contas viola ToS — usar apenas para testes com consentimento
export const createAccount = async ({ username, password, email, proxy }, logger = createLogger('signup')) => {
  logger.warn('Criação automática viola termos do Instagram e costuma falhar. Prefira criar manualmente.');
  const ig = buildClient(username, proxy);
  try {
    // instagram-private-api não garante signup; este método pode falhar/challenge.
    const result = await ig.account.create({ username, password, email });
    await serializeSession(ig, username);
    logger.info({ username }, 'Conta criada (experimental)');
    return { ig, result };
  } catch (err) {
    logger.error({ err }, 'Criação de conta falhou — provável bloqueio/captcha');
    throw err;
  }
};

export const handleCheckpoint = async (ig, username, logger = createLogger(username)) => {
  try {
    await ig.challenge.auto(true);
    await serializeSession(ig, username);
    logger.info('Checkpoint resolvido automaticamente');
  } catch (err) {
    logger.error({ err }, 'Precisa resolver challenge manualmente no app');
  }
};

export const detectActionBlock = (error) => {
  if (!error) return false;
  const msg = error.message || '';
  if (error instanceof IgCheckpointError) return true;
  return msg.includes('feedback_required') || msg.includes('Please wait a few minutes');
};

export default {
  login,
  refreshCookies,
  createAccount,
  handleCheckpoint,
  detectActionBlock,
};
