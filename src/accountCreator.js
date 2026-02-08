import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import TwoCaptcha from '2captcha';
import settings from './settings.js';
import { createLogger } from './utils/logger.js';
import { saveAccounts, loadAccounts } from './utils/cryptoStore.js';

puppeteer.use(StealthPlugin());
const logger = createLogger('creator');

const genStr = (len = 8) => Math.random().toString(36).slice(2, 2 + len);
const randUser = () => `ig${genStr(6)}_${genStr(4)}`;
const randName = () => `Nome ${genStr(5)}`;

const solver = (settings.captchaKey || settings.captcha2)
  ? new TwoCaptcha(settings.captchaKey || settings.captcha2)
  : null;

// --------- Email providers ----------
const getMailTm = async () => {
  const inst = axios.create({
    baseURL: settings.tempMailUrl,
    headers: { Authorization: `Bearer ${settings.tempMailToken}` },
  });
  const { data } = await inst.post('/accounts', { address: '', password: genStr(12) });
  return { provider: 'mailtm', address: data.address, id: data.id, client: inst };
};

const get1SecMail = async () => {
  const domain = '1secmail.com';
  const name = `ig${genStr(8)}`;
  const address = `${name}@${domain}`;
  const api = settings.tempMailAlt1Url || 'https://www.1secmail.com/api/v1/';
  const client = axios.create({ baseURL: api });
  return { provider: '1secmail', address, id: name, client };
};

const getGuerrilla = async () => {
  const api = settings.tempMailAlt2Url || 'https://api.guerrillamail.com/ajax.php';
  const client = axios.create({ baseURL: api });
  const { data } = await client.get('', { params: { f: 'get_email_address' } });
  return { provider: 'guerrilla', address: data?.email_addr, id: data?.sid_token, client };
};

const getTempMail = async () => {
  if (settings.tempMailUrl && settings.tempMailToken) return getMailTm();
  if (settings.tempMailAlt1Url) return get1SecMail();
  return getGuerrilla();
};

// --------- Poll codes ----------
const waitMailTm = async (client, address) => {
  for (let i = 0; i < 30; i += 1) {
    const { data } = await client.get('/messages');
    const msg = data.value?.find((m) => m.to[0]?.address === address);
    if (msg) {
      const full = await client.get(`/messages/${msg.id}`);
      const code = /(\d{6})/.exec(full.data.text);
      if (code) return code[1];
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Código não encontrado (mail.tm)');
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

const waitEmailCode = async (provider, client, address, id) => {
  if (provider === 'mailtm') return waitMailTm(client, address);
  if (provider === '1secmail') return wait1Sec(client, address);
  return waitGuerrilla(client, id);
};

// --------- Captcha solver ----------
const solveRecaptcha = async (sitekey, pageurl) => {
  if (solver) {
    const res = await solver.recaptcha({ googlekey: sitekey, pageurl });
    return res?.data || res;
  }
  throw new Error('Captcha detectado e nenhuma chave CAPTCHA_* definida');
};

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

    if (await page.$('iframe[src*="recaptcha"]')) {
      const sitekey = await page.$eval('iframe[src*="recaptcha"]', (f) => {
        const u = new URL(f.src);
        return u.searchParams.get('k');
      });
      const token = await solveRecaptcha(sitekey, page.url());
      await page.evaluate(`document.getElementById('g-recaptcha-response').innerHTML="${token}"`);
    }

    const code = await waitEmailCode(provider, client, address, id);
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
