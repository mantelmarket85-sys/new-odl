module.exports = {
  apps: [
    {
      name: 'aust-backend',
      cwd: '/home/user/webapp/backend',
      script: 'src/server.js',
      env: { NODE_ENV: 'development', PORT: 5000 },
      watch: false, instances: 1, exec_mode: 'fork',
    },
    {
      name: 'admissions-frontend',
      cwd: '/home/user/webapp/frontend',
      script: 'npm',
      args: 'run dev',
      env: { NODE_ENV: 'development' },
      watch: false, instances: 1, exec_mode: 'fork',
    },
    {
      name: 'lms-frontend',
      cwd: '/home/user/webapp/lms-frontend',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 3001',
      env: { NODE_ENV: 'development', PORT: 3001 },
      watch: false, instances: 1, exec_mode: 'fork',
    },
  ],
};
