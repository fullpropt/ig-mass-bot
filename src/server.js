import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { body, validationResult } from 'express-validator';
import settings from './settings.js';
import { dmQueue, signupQueue } from './queue/index.js';
import { createLogger } from './utils/logger.js';
import { loadAccounts, saveAccounts } from './utils/cryptoStore.js';

const uploadLists = multer({ dest: path.join(settings.rootDir, 'lists') });
const uploadSessions = multer({ dest: settings.sessionsDir });
const logger = createLogger('web');

const startServer = () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/public', express.static(path.join(settings.rootDir, 'public')));
  app.set('view engine', 'ejs');
  app.set('views', path.join(settings.rootDir, 'views'));

  // health/ready
  app.get('/healthz', (_, res) => res.status(200).send('ok'));
  app.get('/readyz', (_, res) => {
    if (process.env.KILL_SWITCH === 'true') return res.status(503).send('kill switch');
    return res.status(200).send('ready');
  });

  app.get('/', (req, res) => res.redirect('/dashboard'));

  app.get('/dashboard', (req, res) => {
    const accounts = loadAccounts();
    const bots = accounts.map((acc) => ({
      username: acc.username,
      status: 'idle',
      stats: {},
      queued: 0,
      proxy: '',
      ready: false,
    }));
    const files = fs.existsSync(settings.listsDir)
      ? fs.readdirSync(settings.listsDir).filter((f) => !f.startsWith('.'))
      : [];
    const firstBot = bots[0]?.username || '';
    res.render('dashboard', { bots, files, settings, path, firstBot });
  });

  app.post('/bots/add',
    body('username').isLength({ min: 2 }),
    (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).send('Dados inválidos');
      const { username, password, proxy, cookie } = req.body;
      // só persiste user/pass (cookie/proxy não guardamos aqui)
      const accounts = loadAccounts();
      const existing = accounts.find((a) => a.username === username);
      if (!existing) accounts.push({ username, password: password || '', email: '' });
      saveAccounts(accounts);
      logger.info({ username, proxy: !!proxy, cookie: !!cookie }, 'Bot adicionado (dados persistidos)');
      return res.redirect('/dashboard');
    });

  app.post('/bots/:username/massdm', uploadLists.single('listfile'), async (req, res) => {
    if (process.env.KILL_SWITCH === 'true') return res.status(503).send('kill switch');
    const { username } = req.params;
    const listPath = req.body.listPath || settings.targetsFile;
    const template = req.body.template || settings.baseMessage;
    const link = req.body.link || settings.defaultLink;
    const mediaPath = req.file ? req.file.path : null;
    await dmQueue.add('dm', { username, listPath, template, link, mediaPath }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    });
    return res.redirect('/dashboard');
  });

  app.post('/sessions/upload', uploadSessions.single('sessionfile'), async (req, res) => {
    const { username } = req.body;
    if (!username || !req.file) return res.status(400).send('username e arquivo são obrigatórios');
    const targetPath = path.join(settings.sessionsDir, `${username}.json`);
    await fs.promises.rename(req.file.path, targetPath);
    return res.redirect('/dashboard');
  });

  app.post('/accounts/create', body('qty').optional().isInt({ min: 1, max: 5 }), async (req, res) => {
    if (process.env.KILL_SWITCH === 'true') return res.status(503).send('kill switch');
    if (!settings.createV2) return res.status(400).send('CREATE_V2 desabilitado');
    const qty = Number(req.body.qty || 1);
    await signupQueue.add('signup', { qty, proxies: [] }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 120_000 },
    });
    return res.redirect('/dashboard');
  });

  // Ações diretas desabilitadas neste modo; todas via worker
  app.post('/actions/:username/:action', (req, res) => res.status(501).send('Use o worker/filas'));

  app.listen(settings.port, () => logger.info(`Dashboard http://localhost:${settings.port}`));
};

export default startServer;
