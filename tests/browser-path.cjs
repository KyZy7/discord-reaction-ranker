const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function browserPath() {
  const override = process.env.BROWSER_PATH || process.env.EDGE_PATH;
  if (override) {
    if (!fs.existsSync(override)) throw new Error('BROWSER_PATH does not identify an existing browser executable.');
    return override;
  }
  const candidates = process.platform === 'win32'
    ? [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
      .filter(Boolean).map(base => path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    : process.platform === 'darwin'
      ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found) return found;
  for (const name of ['microsoft-edge', 'chromium']) {
    const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) return result.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Set BROWSER_PATH to Edge, Chrome, Chromium, or Chrome for Testing. Current regular Chrome uses the test-only CDP loader.');
}
module.exports = { browserPath };
