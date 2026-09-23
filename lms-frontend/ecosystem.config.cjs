module.exports = {
  apps: [
    {
      name: 'lms-frontend',
      script: 'npx',
      args: 'vite --host 0.0.0.0 --port 5174 --strictPort',
      cwd: '/home/user/webapp/lms-frontend',
      env: {
        NODE_ENV: 'development',
        PORT: 5174
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 5
    }
  ]
};
