const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const config = require('./config');

function loadCredentials() {
  const file = config.PASSWORD_FILE;
  if (!fs.existsSync(file)) {
    const creds = {
      username: config.INITIAL_ADMIN_USER,
      passwordHash: bcrypt.hashSync(config.INITIAL_ADMIN_PASSWORD, 10),
      masterPasswordHash: bcrypt.hashSync(config.MASTER_PASSWORD, 10),
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    saveCredentials(creds);
    return creds;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveCredentials(creds) {
  const file = config.PASSWORD_FILE;
  creds.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(creds, null, 2));
  fs.renameSync(tmp, file);
}

function verifyPassword(plain) {
  const creds = loadCredentials();
  return bcrypt.compareSync(plain, creds.passwordHash) ||
         bcrypt.compareSync(plain, creds.masterPasswordHash);
}

module.exports = { loadCredentials, saveCredentials, verifyPassword };