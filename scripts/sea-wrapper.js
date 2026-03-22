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

// Debug: list what we extracted
var prebuildsDir = path.join(tmpDir, 'prebuilds');
if (fs.existsSync(prebuildsDir)) {
  var platforms = fs.readdirSync(prebuildsDir);
  for (var p = 0; p < platforms.length; p++) {
    var files = fs.readdirSync(path.join(prebuildsDir, platforms[p]));
    process.stderr.write('[sea-wrapper] prebuilds/' + platforms[p] + '/: ' + files.join(', ') + '\n');
  }
}

// Load the bundle with Module._compile — gives it real __dirname and require()
var m = new Module(bundlePath);
m.filename = bundlePath;
m.paths = Module._nodeModulePaths(path.dirname(bundlePath));
m._compile(fs.readFileSync(bundlePath, 'utf-8'), bundlePath);
