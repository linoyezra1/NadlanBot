import { spawn } from 'node:child_process';
import { ensureDatabaseUrl } from '../src/ensureDatabaseUrl.js';

await ensureDatabaseUrl();
const child = spawn('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
