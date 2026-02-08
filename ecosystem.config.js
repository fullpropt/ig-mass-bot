module.exports = {
  apps: [
    {
      name: 'IG-MASS-BOT-PRO',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
