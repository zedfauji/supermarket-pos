import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from '../fixtures';

const BAR_POS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd: string): void {
  // No explicit `shell` override: Node's execSync already picks the right
  // default per platform (cmd.exe on Windows via ComSpec, /bin/sh on Linux/macOS).
  // The old hardcoded `cmd.exe` fallback broke every run on Ubuntu (Phase 36
  // migrated dev off Windows) with `spawnSync cmd.exe ENOENT`.
  execSync(cmd, { cwd: BAR_POS, stdio: 'inherit' });
}

test.describe('CI Checks', () => {
  test('npm run typecheck exits 0', () => {
    run('npm run typecheck');
  });

  test('npm run lint exits 0', () => {
    run('npm run lint');
  });

  test('npm run test exits 0 (unit project)', () => {
    // Verbose reporter: dot-only output looks frozen when many tests don't log to stdout.
    run('npx vitest run --project unit --reporter=verbose');
  });
});
