// Keeps the phone app's copy of the shared code (money, time, offline sync) up to date.
// In the cloud build the shared folder isn't there, so the copy already in src/core is used.
const fs = require('fs'), path = require('path');
const from = path.join(__dirname, '../../../packages/core/src'), to = path.join(__dirname, '../src/core');
if (fs.existsSync(from)) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) if (f.endsWith('.ts')) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
