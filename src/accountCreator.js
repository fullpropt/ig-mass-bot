import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import settings from './settings.js';
import { createLogger } from './utils/logger.js';

puppeteer.use(StealthPlugin());

const logger = createLogger('accountCreator');

const appendAccount = (account) => {
  const line = `\n${account.username}:${account.password}:${account.email || ''}`;
  fs.appendFileSync(path.join(settings.rootDir, settings.accountsFile || 'accounts.txt'), line);
};

export const createWithPuppeteer = async ({ proxy, email, username, password, captchaKey = process.env.CAPTCHA_API_KEY }) => {
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--lang=en-US,en',
  ];
  if (proxy) launchArgs.push(`--proxy-server=${proxy}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: launchArgs,
  });
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1');
    await page.goto('https://www.instagram.com/accounts/emailsignup/', { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('input[name="emailOrPhone"]', { timeout: 20000 });
    await page.type('input[name="emailOrPhone"]', email, { delay: 50 });
    await page.type('input[name="fullName"]', username, { delay: 50 });
    await page.type('input[name="username"]', username, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });

    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForTimeout(5000),
    ]);

    // Obs: captcha/email verification não implementados aqui.
    // Este módulo é um esqueleto para ser customizado com solver/IMAP.

    appendAccount({ username, password, email });
    logger.info({ username, proxy }, 'Conta criada (esqueleto)');
    return { success: true };
  } catch (err) {
    logger.error({ err }, 'Falha ao criar conta via puppeteer');
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
};

export default { createWithPuppeteer };
