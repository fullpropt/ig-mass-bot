import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

// Ajuste aqui
const USERNAME = process.env.IG_USER || 'amycooperhyc67495';
const COOKIE_STRING = process.env.IG_COOKIE || '';

if (!COOKIE_STRING) {
  console.error('Defina IG_COOKIE com o cookie completo (sessionid=...; csrftoken=...; etc)');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT = path.join(__dirname, '..', 'sessions', `${USERNAME}.json`);

const cookieArray = COOKIE_STRING.split(';')
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [name, ...rest] = c.split('=');
    return {
      name,
      value: rest.join('='),
      domain: '.instagram.com',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    };
  });

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.setCookie(...cookieArray);
  await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });

  const logged = await page.evaluate(() => Boolean(document.querySelector('a[href*="/accounts/edit/"]')));
  if (!logged) {
    console.error('Não logou com o cookie. Verifique IG_COOKIE/sessionid.');
    await browser.close();
    process.exit(1);
  }

  const finalCookies = await page.cookies();
  const state = {
    cookies: finalCookies,
    userId: cookieArray.find((c) => c.name === 'ds_user_id')?.value || null,
  };
  fs.mkdirSync(path.join(__dirname, '..', 'sessions'), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(state, null, 2));
  console.log('Sessão salva em', OUTPUT);
  await browser.close();
})();
