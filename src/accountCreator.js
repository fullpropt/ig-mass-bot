import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import settings from './settings.js';
import { createLogger } from './utils/logger.js';
import { saveAccounts, loadAccounts } from './utils/cryptoStore.js';

puppeteer.use(StealthPlugin());
const logger = createLogger('creator');

const genStr = (len = 8) => Math.random().toString(36).slice(2, 2 + len);
const randUser = () => `ig${genStr(6)}_${genStr(4)}`;
const randName = () => `Nome ${genStr(5)}`;

// --------- Email providers (somente sem token) ----------
const get1SecMail = async () => {
  const domain = '1secmail.com';
  const name = `ig${genStr(8)}`;
  const address = `${name}@${domain}`;
  const api = settings.tempMailAlt1Url;
  const client = axios.create({ baseURL: api });
  return { provider: '1secmail', address, id: name, client };
};

const wait1Sec = async (client, address) => {
  const [name, domain] = address.split('@');
  for (let i = 0; i < 30; i += 1) {
    const { data } = await client.get('', { params: { action: 'getMessages', login: name, domain } });
    if (data?.length) {
      const msg = data[0];
      const full = await client.get('', { params: { action: 'readMessage', login: name, domain, id: msg.id } });
      const code = /(\d{6})/.exec(full.data?.body || '');
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Código não encontrado (1secmail)');
};

const getGuerrilla = async () => {
  const api = settings.tempMailAlt2Url;
  const client = axios.create({ baseURL: api });
  const { data } = await client.get('', { params: { f: 'get_email_address' } });
  return { provider: 'guerrilla', address: data?.email_addr, id: data?.sid_token, client };
};

const waitGuerrilla = async (client, sid) => {
  for (let i = 0; i < 30; i += 1) {
    const { data } = await client.get('', { params: { f: 'get_email_list', sid_token: sid, offset: 0 } });
    if (data?.list?.length) {
      const mail = data.list[0];
      const full = await client.get('', { params: { f: 'fetch_email', sid_token: sid, email_id: mail.mail_id } });
      const code = /(\d{6})/.exec(full.data?.mail_body || '');
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Código não encontrado (GuerrillaMail)');
};

const getTempMail = async () => {
  // tenta 1secmail primeiro, fallback guerrilla
  try {
    return await get1SecMail();
  } catch (e) {
    logger.warn('1secmail falhou, tentando guerrilla');
    return getGuerrilla();
  }
};

// --------- Signup ----------
export const createAccountsBatch = async (qty, proxies) => {
  const created = [];
  for (let i = 0; i < qty; i += 1) {
    const proxy = proxies[i % (proxies.length || 1)];
    const res = await createSingle(proxy);
    if (res.success) created.push(res.account);
  }
  if (created.length) {
    const current = loadAccounts();
    saveAccounts([...current, ...created]);
  }
  return { success: true, created };
};

export const createSingle = async (proxy) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--lang=en-US,en',
      proxy ? `--proxy-server=${proxy}` : '',
    ].filter(Boolean),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage();
  try {
    const { provider, address, client, id } = await getTempMail();
    const username = randUser();
    const password = settings.passwordDefault || 'SenhaForte!123';

    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    await page.goto('https://www.instagram.com/accounts/emailsignup/', { waitUntil: 'networkidle2', timeout: 60000 });

    await page.type('input[name="emailOrPhone"]', address, { delay: 40 });
    await page.type('input[name="fullName"]', randName(), { delay: 40 });
    await page.type('input[name="username"]', username, { delay: 40 });
    await page.type('input[name="password"]', password, { delay: 40 });
    await Promise.all([page.click('button[type="submit"]'), page.waitForTimeout(4000)]);

    // Captcha: se encontrar e não houver solver, aborta com erro amigável
    if (await page.$('iframe[src*="recaptcha"]')) {
      throw new Error('Captcha detectado e nenhum solver configurado (CAPTCHA_API_KEY vazio)');
    }

    const code = provider === '1secmail'
      ? await wait1Sec(client, address)
      : await waitGuerrilla(client, id);

    await page.type('input[name="email_confirmation_code"]', code, { delay: 60 });
    await Promise.all([page.click('button[type="submit"]'), page.waitForTimeout(5000)]);

    logger.info({ username, proxy }, 'Conta criada');
    return { success: true, account: { username, password, email: address } };
  } catch (err) {
    logger.error({ err: err.message }, 'Falha ao criar conta');
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
};

export default { createAccountsBatch, createSingle };
