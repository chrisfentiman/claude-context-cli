// SEA wrapper — runs BEFORE the main bundle.
// 1. Extracts native .node prebuilds from SEA assets to tmpdir
// 2. Loads the JS bundle via Module._compile with correct paths

'use strict';

var sea = require('node:sea');
var fs = require('fs');
var path = require('path');
var os = require('os');
var Module = require('module');

var keys = sea.getAssetKeys();
var tmpDir = path.join(os.tmpdir(), 'claude-context-cli');
fs.mkdirSync(tmpDir, { recursive: true });

// Extract native .node prebuilds
for (var i = 0; i < keys.length; i++) {
  var key = keys[i];
  if (key === 'bundle.js') continue;
  if (!key.endsWith('.node')) continue;

  var extractPath = path.join(tmpDir, key);
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(path.dirname(extractPath), { recursive: true });
    fs.writeFileSync(extractPath, new Uint8Array(sea.getRawAsset(key)));
  }
}

// Write bundle to disk so require() from within it resolves against filesystem
var bundlePath = path.join(tmpDir, 'bundle.js');
fs.writeFileSync(bundlePath, sea.getAsset('bundle.js', 'utf-8'));

// Write node-gyp-build so the bundle can require it
var ngbDir = path.join(tmpDir, 'node_modules', 'node-gyp-build');
fs.mkdirSync(ngbDir, { recursive: true });
fs.writeFileSync(path.join(ngbDir, 'index.js'), sea.getAsset('node-gyp-build.js', 'utf-8'));
fs.writeFileSync(path.join(ngbDir, 'package.json'), '{"name":"node-gyp-build","main":"index.js"}');

// Debug: list what we extracted
var prebuildsDir = path.join(tmpDir, 'prebuilds');
if (fs.existsSync(prebuildsDir)) {
  var platforms = fs.readdirSync(prebuildsDir);
  for (var p = 0; p < platforms.length; p++) {
    var files = fs.readdirSync(path.join(prebuildsDir, platforms[p]));
    process.stderr.write('[sea-wrapper] prebuilds/' + platforms[p] + '/: ' + files.join(', ') + '\n');
  }
}

// Load the bundle via Module._load which sets up require() properly
// _load creates the module, sets filename/paths, compiles, and caches it
Module._load(bundlePath, null, true);
