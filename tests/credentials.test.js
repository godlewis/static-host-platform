const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function withTempCreds(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
  process.env.PASSWORD_FILE = path.join(dir, 'creds.json');
  delete require.cache[require.resolve('../server/config')];
  delete require.cache[require.resolve('../server/credentials')];
  return fn().finally(() => {
    delete require.cache[require.resolve('../server/credentials')];
    delete require.cache[require.resolve('../server/config')];
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('loadCredentials initializes file when missing', async () => {
  await withTempCreds(async () => {
    const creds = require('../server/credentials').loadCredentials();
    assert.strictEqual(creds.username, 'admin');
    assert.ok(creds.passwordHash.startsWith('$2'));
    assert.ok(creds.masterPasswordHash.startsWith('$2'));
    assert.ok(fs.existsSync(process.env.PASSWORD_FILE));
  });
});

test('loadCredentials returns existing creds on second call', async () => {
  await withTempCreds(async () => {
    const first = require('../server/credentials').loadCredentials();
    first.passwordHash = 'changed';
    require('../server/credentials').saveCredentials(first);
    const second = require('../server/credentials').loadCredentials();
    assert.strictEqual(second.passwordHash, 'changed');
  });
});

test('verifyPassword accepts admin password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('admin123'), true);
  });
});

test('verifyPassword accepts master password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('liuyan@2026'), true);
  });
});

test('verifyPassword rejects wrong password', async () => {
  await withTempCreds(async () => {
    const { verifyPassword } = require('../server/credentials');
    require('../server/credentials').loadCredentials();
    assert.strictEqual(verifyPassword('wrong'), false);
  });
});