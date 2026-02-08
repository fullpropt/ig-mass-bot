import startServer from './server.js';
import './workers/dmWorker.js';
import './workers/signupWorker.js';

const role = process.env.ROLE || 'web';

if (role === 'web') {
  startServer();
} else if (role === 'dm-worker') {
  // dmWorker imported above auto-starts
  console.log('dm-worker rodando');
} else if (role === 'signup-worker') {
  // signupWorker imported above auto-starts
  console.log('signup-worker rodando');
} else {
  startServer();
}
