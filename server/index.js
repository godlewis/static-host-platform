// 双端口入口：管理端 3001 + 公开端 3000
const config = require('./config');
const { createApps } = require('./app');

const { adminApp, publicApp } = createApps();

adminApp.listen(config.ADMIN_PORT, () => {
  console.log(`[Admin] http://localhost:${config.ADMIN_PORT}`);
});
publicApp.listen(config.PUBLIC_PORT, () => {
  console.log(`[Public] http://localhost:${config.PUBLIC_PORT}`);
});