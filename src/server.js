import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import settings from './settings.js';
import downloader from './utils/downloader.js';

const upload = multer({ dest: path.join(settings.rootDir, 'lists') });

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
    const { username, password, proxy } = req.body;
    if (!username || !password) return res.status(400).send('username/password obrigatórios');
    try {
      await manager.addBot({ username, password, proxy });
      return res.redirect('/dashboard');
    } catch (err) {
      // Retorna erro sem derrubar o servidor (evita 502)
      return res.status(500).send(`Falha ao adicionar bot: ${err.message || err}`);
    }
  });

  app.post('/bots/:username/massdm', upload.single('listfile'), async (req, res) => {
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
