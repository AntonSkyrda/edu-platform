import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export async function promptPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Run this command in an interactive terminal to enter the password.',
    );
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const abort = new AbortController();
  reader.on('SIGINT', () => abort.abort());
  reader.on('close', () => abort.abort());
  try {
    process.stdout.write('Password (hidden): ');
    const password = await reader.question('', { signal: abort.signal });
    process.stdout.write('\nConfirm password (hidden): ');
    const confirmation = await reader.question('', { signal: abort.signal });
    if (password !== confirmation) throw new Error('Passwords do not match.');
    return password;
  } finally {
    reader.close();
    output.destroy();
    process.stdout.write('\n');
  }
}
