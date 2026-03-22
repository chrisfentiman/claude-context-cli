// SEA wrapper — runs BEFORE the main bundle.
// Extracts native .node prebuilds from SEA assets to disk,
// then loads the bundled application.

'use strict';

const sea = require('node:sea');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Extract all .node assets to a predictable location
const keys = sea.getAssetKeys();
const execDir = path.dirname(process.execPath);

for (const key of keys) {
  if (key === 'bundle.js') continue; // skip the app bundle
  if (!key.endsWith('.node')) continue;

  const extractPath = path.join(execDir, key);
  if (!fs.existsSync(extractPath)) {
    const dir = path.dirname(extractPath);
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.writeFileSync(extractPath, new Uint8Array(sea.getRawAsset(key)));
    } catch (e) {
      // execDir might be read-only, fall back to tmpdir
      const tmpPath = path.join(os.tmpdir(), 'claude-context-cli', key);
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, new Uint8Array(sea.getRawAsset(key)));
      // Create symlink so node-gyp-build finds it
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.copyFileSync(tmpPath, extractPath);
      } catch (e2) { /* best effort */ }
    }
  }
}

// Now load the actual application bundle from assets
const bundleSource = sea.getAsset('bundle.js', 'utf-8');
const Module = require('module');
const m = new Module('claude-context-cli');
m._compile(bundleSource, path.join(execDir, 'bundle.js'));
