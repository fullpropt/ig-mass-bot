import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import { Solver } from '2captcha';
import settings from './settings.js';
import { createLogger } from './utils/logger.js';
import { saveAccounts, loadAccounts } from './utils/cryptoStore.js';

puppeteer.use(StealthPlugin());
const logger = createLogger('creator');

const genStr = (len = 8) => Math.random().toString(36).slice(2, 2 + len);
const randUser = () => `ig${genStr(6)}_${genStr(4)}`;
const randName = () => `Nome ${genStr(5)}`;
const solver = new Solver(settings.captchaKey || 'COLOQUE_APIKEY');

const getTempMail = async () => {
  if (!settings.tempMailUrl || !settings.tempMailToken) throw new Error('TEMPMAIL_API_URL/TOKEN não definidos');
  const inst = axios.create({
    baseURL: settings.tempMailUrl,
    headers: { Authorization: `Bearer ${settings.tempMailToken}` }
  });
  const { data } = await inst.post('/accounts', { address: '', password: genStr(12) });
  return { address: data.address, password: data.password, id: data.id, client: inst };
};

const waitEmailCode = async (client, address) => {
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
  throw new Error('Código de verificação não encontrado');
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
  return created;
};

export const createSingle = async (proxy) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--lang=en-US,en',
      proxy ? `--proxy-server=${proxy}` : ''
    ].filter(Boolean),
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  });
  const page = await browser.newPage();
  try {
    const { address, client } = await getTempMail();
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
      const { data } = await solver.recaptcha({ googlekey: sitekey, pageurl: page.url() });
      await page.evaluate(`document.getElementById('g-recaptcha-response').innerHTML="${data}";`);
    }

    const code = await waitEmailCode(client, address);
    await page.type('input[name="email_confirmation_code"]', code, { delay: 60 });
    await Promise.all([page.click('button[type="submit"]'), page.waitForTimeout(5000)]);

    logger.info({ username, proxy }, 'Conta criada');
    return { success: true, account: { username, password, email: address } };
  } catch (err) {
    logger.error({ err: err.message }, 'Falha ao criar conta');
    return { success: false, error: err.message };
  } finally { await browser.close(); }
};
