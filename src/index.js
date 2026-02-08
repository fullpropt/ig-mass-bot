const role = process.env.ROLE || 'web';

if (role === 'web') {
  const startServer = (await import('./server.js')).default; // eslint-disable-line global-require
  startServer();
} else if (role === 'dm-worker') {
  await import('./workers/dmWorker.js');
  console.log('dm-worker rodando');
} else if (role === 'signup-worker') {
  await import('./workers/signupWorker.js');
  console.log('signup-worker rodando');
} else {
  const startServer = (await import('./server.js')).default;
  startServer();
}
