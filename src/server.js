import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import settings from './settings.js';
import downloader from './utils/downloader.js';

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
    const files = fs.readdirSync(settings.listsDir).filter((f) => !f.startsWith('.'));
    res.render('dashboard', { bots, files, settings, path });
  });

  app.get('/api/status', (req, res) => {
    const payload = manager.bots.map((bot) => ({
      username: bot.username,
      status: bot.massSender?.status,
      stats: bot.massSender?.stats,
      queued: bot.massSender?.queue?.length || 0,
      proxy: bot.proxy,
    }));
    res.json(payload);
  });

  app.post('/bots/add', async (req, res) => {
    const { username, password, proxy, cookie } = req.body;
    if (!username) return res.status(400).send('username obrigatório');
    if (!password && !cookie) return res.status(400).send('informe senha ou cookie');
    try {
      await manager.addBot({ username, password, proxy, cookie });
      return res.redirect('/dashboard');
    } catch (err) {
      // Retorna erro sem derrubar o servidor (evita 502)
      return res.status(500).send(`Falha ao adicionar bot: ${err.message || err}`);
    }
  });

  app.post('/bots/:username/massdm', uploadLists.single('listfile'), async (req, res) => {
    const { username } = req.params;
    const bot = manager.getBot(username);
    if (!bot) return res.status(404).send('Bot não encontrado');
    if (!bot.ready) return res.status(400).send('Bot não está logado ainda');

    const template = req.body.template || settings.baseMessage;
    const link = req.body.link || settings.defaultLink;
    let listPath = req.body.listPath;
    if (req.file) listPath = req.file.path;
    if (!listPath) listPath = settings.targetsFile;

    await bot.massSender.loadRecipients(listPath);
    bot.massSender.sendAll({ template, link });
    return res.redirect('/dashboard');
  });

  app.post('/sessions/upload', uploadSessions.single('sessionfile'), async (req, res) => {
    const { username } = req.body;
    if (!username || !req.file) return res.status(400).send('username e arquivo são obrigatórios');
    try {
      const targetPath = path.join(settings.sessionsDir, `${username}.json`);
      await fs.promises.rename(req.file.path, targetPath);
      return res.redirect('/dashboard');
    } catch (err) {
      return res.status(500).send(`Falha ao salvar sessão: ${err.message || err}`);
    }
  });

  app.post('/bots/:username/pause', (req, res) => {
    const bot = manager.getBot(req.params.username);
    if (!bot) return res.status(404).send('Bot não encontrado');
    bot.massSender.pause();
    res.redirect('/dashboard');
  });

  app.post('/bots/:username/resume', (req, res) => {
    const bot = manager.getBot(req.params.username);
    if (!bot) return res.status(404).send('Bot não encontrado');
    bot.massSender.resume();
    res.redirect('/dashboard');
  });

  app.post('/bots/:username/stop', (req, res) => {
    const bot = manager.getBot(req.params.username);
    if (!bot) return res.status(404).send('Bot não encontrado');
    bot.massSender.stop();
    res.redirect('/dashboard');
  });

  app.post('/download/story', async (req, res) => {
    const { mediaId } = req.body;
    const bot = manager.bots[0];
    if (!bot?.ready) return res.status(400).send('Nenhum bot pronto');
    try {
      const file = await downloader.downloadStory(bot.ig, mediaId);
      res.download(file);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/download/post', async (req, res) => {
    const { mediaId } = req.body;
    const bot = manager.bots[0];
    if (!bot?.ready) return res.status(400).send('Nenhum bot pronto');
    try {
      const file = await downloader.downloadPost(bot.ig, mediaId);
      res.download(file);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.listen(settings.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard em http://localhost:${settings.port}`);
  });
};

export default startServer;
