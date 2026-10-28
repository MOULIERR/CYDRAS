// Runs Expo's build tool without needing Git installed. Example: npm run build-android
process.env.EAS_NO_VCS = '1';
const { spawnSync } = require('child_process');
const r = spawnSync('npx', ['--yes', 'eas-cli@latest', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: process.env, cwd: require('path').join(__dirname, '..') });
process.exit(r.status ?? 1);
