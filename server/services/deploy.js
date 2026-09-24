const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const config = require('../config');

async function deployZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    throw new Error('INVALID_ZIP');
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    throw new Error('EMPTY_ZIP');
  }

  // Pre-flight: validate every entry path before touching disk
  for (const entry of entries) {
    const normalized = path.normalize(entry.entryName);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('PATH_TRAVERSAL');
    }
  }

  const siteDir = config.SITE_DIR;
  const bakDir = `${siteDir}.${process.pid}.${Date.now()}.bak`;

  fs.mkdirSync(siteDir, { recursive: true });

  // Snapshot current site (if exists)
  if (fs.existsSync(siteDir)) {
    fs.cpSync(siteDir, bakDir, { recursive: true });
  }

  try {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.mkdirSync(siteDir);
    zip.extractAllTo(siteDir, true);
    if (fs.existsSync(bakDir)) {
      fs.rmSync(bakDir, { recursive: true, force: true });
    }
  } catch (e) {
    // Rollback: restore snapshot
    fs.rmSync(siteDir, { recursive: true, force: true });
    if (fs.existsSync(bakDir)) {
      fs.renameSync(bakDir, siteDir);
    }
    throw e;
  }
}

module.exports = { deployZip };