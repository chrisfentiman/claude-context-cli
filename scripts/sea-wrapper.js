// SEA wrapper — runs BEFORE the main bundle.
// 1. Extracts native .node prebuilds from SEA assets to disk
// 2. Writes the JS bundle to a temp file
// 3. Requires it — giving it a real filesystem context for require() resolution

'use strict';

const sea = require('node:sea');
const fs = require('fs');
const path = require('path');
const os = require('os');

const keys = sea.getAssetKeys();
const tmpDir = path.join(os.tmpdir(), 'claude-context-cli');
fs.mkdirSync(tmpDir, { recursive: true });

// Extract native .node prebuilds to tmpDir so node-gyp-build finds them
for (const key of keys) {
  if (key === 'bundle.js') continue;
  if (!key.endsWith('.node')) continue;

  const extractPath = path.join(tmpDir, key);
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(path.dirname(extractPath), { recursive: true });
    fs.writeFileSync(extractPath, new Uint8Array(sea.getRawAsset(key)));
  }
}

// Write bundle to tmpDir so it has a real filesystem path
const bundlePath = path.join(tmpDir, 'bundle.js');
const bundleSource = sea.getAsset('bundle.js', 'utf-8');
fs.writeFileSync(bundlePath, bundleSource);

// Set process.execPath dirname to tmpDir so node-gyp-build's
// resolve(path.dirname(process.execPath)) fallback finds our prebuilds
const origExecPath = process.execPath;
Object.defineProperty(process, 'execPath', {
  get() { return path.join(tmpDir, path.basename(origExecPath)); },
  configurable: true
});

// Now require the bundle — it has a real __dirname and require() works
require(bundlePath);
