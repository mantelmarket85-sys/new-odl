module.exports = {
  apps: [{
    name: 'lms-backend',
    script: 'src/server.js',
    cwd: '/home/user/webapp/backend',
    env: { NODE_ENV: 'development', PORT: 5000 },
    watch: false,
    instances: 1,
    exec_mode: 'fork'
  }]
}
