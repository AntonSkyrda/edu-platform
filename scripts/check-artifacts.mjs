import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const git = (args) =>
  execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const paths = (args) => git(args).toString('utf8').split('\0').filter(Boolean);
const tracked = new Set(paths(['ls-files', '-z']));
const files = [
  ...new Set([
    ...tracked,
    ...paths(['ls-files', '--others', '--exclude-standard', '-z']),
  ]),
];
const candidates = files.filter((path) =>
  / [2-9][0-9]*(?=\.[^/]+$|\/)| 1[0-9]+(?=\.[^/]+$|\/)/.test(path),
);
let unresolved = 0;
for (const path of candidates) {
  const original = path.replace(/ [0-9]+(?=\.[^/]+$|\/)/g, '');
  const absolute = resolve(root, path);
  let verified = false;
  if (
    process.argv.includes('--fix') &&
    !tracked.has(path) &&
    tracked.has(original) &&
    lstatSync(absolute).isFile()
  ) {
    const copy = readFileSync(absolute);
    try {
      verified = copy.equals(readFileSync(resolve(root, original)));
    } catch {
      verified = false;
    }
    if (!verified) {
      const revisions = git(['log', '--format=%H', '--', original])
        .toString('utf8')
        .trim()
        .split('\n')
        .filter(Boolean);
      verified = revisions.some((revision) => {
        try {
          return copy.equals(git(['show', `${revision}:${original}`]));
        } catch {
          return false;
        }
      });
    }
    if (verified) {
      unlinkSync(absolute);
      process.stdout.write(`Removed verified duplicate: ${path}\n`);
    }
  }
  if (!verified) {
    unresolved++;
    process.stderr.write(`Review duplicate candidate: ${path}\n`);
  }
}
if (unresolved) {
  process.stderr.write(
    'Duplicate candidates remain. Run pnpm artifacts:clean; review any differing or tracked files manually.\n',
  );
  process.exitCode = 1;
} else process.stdout.write('Repository artifact check passed.\n');
