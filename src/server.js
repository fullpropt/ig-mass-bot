import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import settings from './settings.js';
import downloader from './utils/downloader.js';
import { createAccountsBatch } from './accountCreator.js';

const uploadLists = multer({ dest: path.join(settings.rootDir, 'lists') });
const uploadSessions = multer({ dest: settings.sessionsDir });

const startServer = (manager) => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use('/public', express.static(path.join(settings.rootDir, 'public')));
  app.set('view engine', 'ejs');
  app.set('views', path.join(settings.rootDir, 'views'));

  app.get('/', (req, res) => res.redirect('/dashboard'));

  app.get('/dashboard', (req, res) => {
    const bots = manager.bots.map((bot) => ({
      username: bot.username,
      ready: bot.ready,
      status: bot.massSender?.status || 'idle',
      stats: bot.massSender?.stats || {},
      queued: bot.massSender?.queue?.length || 0,
      proxy: bot.proxy,
    }));
    const files = fs.existsSync(settings.listsDir)
      ? fs.readdirSync(settings.listsDir).filter((f) => !f.startsWith('.'))
      : [];
    const firstBot = bots[0]?.username || '';
    res.render('dashboard', { bots, files, settings, path, firstBot });
  });

  app.post('/bots/add', async (req, res) => {
    const { username, password, proxy, cookie } = req.body;
    if (!username) return res.status(400).send('username obrigatório');
    if (!password && !cookie) return res.status(400).send('senha ou cookie obrigatório');
    try { await manager.addBot({ username, password, proxy, cookie }); return res.redirect('/dashboard'); }
    catch (err) { return res.status(500).send(`Falha ao adicionar bot: ${err.message || err}`); }
  });

  app.post('/bots/:username/massdm', uploadLists.single('listfile'), async (req, res) => {
    const bot = manager.getBot(req.params.username);
    if (!bot?.ready) return res.status(400).send('Bot não pronto');
    const template = req.body.template || settings.baseMessage;
    const link = req.body.link || settings.defaultLink;
    const mediaPath = req.file ? req.file.path : null;
    const listPath = req.body.listPath || settings.targetsFile;
    await bot.massSender.loadRecipients(listPath);
    bot.massSender.sendAll({ template, link, mediaPath });
    return res.redirect('/dashboard');
  });

  app.post('/bots/:username/pause', (req, res) => { const b = manager.getBot(req.params.username); b?.massSender.pause(); res.redirect('/dashboard'); });
  app.post('/bots/:username/resume', (req, res) => { const b = manager.getBot(req.params.username); b?.massSender.resume(); res.redirect('/dashboard'); });
  app.post('/bots/:username/stop', (req, res) => { const b = manager.getBot(req.params.username); b?.massSender.stop(); res.redirect('/dashboard'); });

  app.post('/download/story', async (req, res) => {
    const bot = manager.bots[0]; if (!bot?.ready) return res.status(400).send('Nenhum bot pronto');
    try { const f = await downloader.downloadStory(bot.ig, req.body.mediaId); return res.download(f); }
    catch (err) { return res.status(500).send(err.message); }
  });

  app.post('/download/post', async (req, res) => {
    const bot = manager.bots[0]; if (!bot?.ready) return res.status(400).send('Nenhum bot pronto');
    try { const f = await downloader.downloadPost(bot.ig, req.body.mediaId); return res.download(f); }
    catch (err) { return res.status(500).send(err.message); }
  });

  app.post('/sessions/upload', uploadSessions.single('sessionfile'), async (req, res) => {
    const { username } = req.body;
    if (!username || !req.file) return res.status(400).send('username e arquivo são obrigatórios');
    const targetPath = path.join(settings.sessionsDir, `${username}.json`);
    await fs.promises.rename(req.file.path, targetPath);
    return res.redirect('/dashboard');
  });

  app.post('/accounts/create', async (req, res) => {
    if (!settings.createV2) return res.status(400).send('CREATE_V2 desabilitado');
    const qty = Number(req.body.qty || 1);
    try {
      const result = await createAccountsBatch(qty, manager.proxyManager.goodProxies);
      if (result?.success === false) return res.status(400).send(result.error || 'Falha na criação');
      return res.redirect('/dashboard');
    } catch (err) {
      return res.status(500).send(`Falha ao criar: ${err.message || err}`);
    }
  });

  app.post('/actions/:username/like', async (req, res) => {
    const bot = manager.getBot(req.params.username); if (!bot?.ready) return res.status(400).send('Bot não pronto');
    await bot.actions.massLike({ mediaListPath: req.body.listPath, limit: Number(req.body.limit) || 50 });
    return res.redirect('/dashboard');
  });

  app.post('/actions/:username/comment', async (req, res) => {
    const bot = manager.getBot(req.params.username); if (!bot?.ready) return res.status(400).send('Bot não pronto');
    await bot.actions.massComment({ mediaListPath: req.body.listPath, limit: Number(req.body.limit) || 20, template: req.body.template || 'Nice!' });
    return res.redirect('/dashboard');
  });

  app.post('/actions/:username/report', async (req, res) => {
    const bot = manager.getBot(req.params.username); if (!bot?.ready) return res.status(400).send('Bot não pronto');
    const ids = (req.body.targets || '').split(/\r?\n/).filter(Boolean);
    await bot.actions.massReport({ userIds: ids, reason: req.body.reason || 'spam', count: Number(req.body.count) || 5 });
    return res.redirect('/dashboard');
  });

  app.listen(settings.port, () => console.log(`Dashboard http://localhost:${settings.port}`));
};

export default startServer;
