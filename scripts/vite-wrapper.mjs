import { spawn } from 'node:child_process';

const args = process.argv.slice(2).map(arg =>
  arg === '--hostname' ? '--host' : arg
);

spawn('./node_modules/.bin/vite', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
