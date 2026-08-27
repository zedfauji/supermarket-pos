/**
 * Writes repo-root VERIFICATION_REPORT.md from Playwright JSON output.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const RESULTS = path.join(PROJECT_ROOT, 'e2e-results', 'results.json');
const REPO_ROOT = path.join(PROJECT_ROOT, '..');
const REPORT = path.join(REPO_ROOT, 'VERIFICATION_REPORT.md');

type ResultEntry = { status: string; error?: { message?: string } };

type SpecEntry = {
  title: string;
  file?: string;
  tests?: { results?: ResultEntry[] }[];
};

type Suite = {
  title: string;
  file?: string;
  suites?: Suite[];
  specs?: SpecEntry[];
  /** Legacy Playwright JSON shape */
  tests?: { title: string; results?: ResultEntry[] }[];
};

function lastStatus(results: ResultEntry[] | undefined): string {
  if (!results?.length) return 'unknown';
  return results[results.length - 1]?.status ?? 'unknown';
}

function walkSuite(
  s: Suite,
  fileHint: string | undefined,
  onTest: (file: string, status: string) => void
) {
  const file = s.file ?? fileHint;
  const nextFile = file ?? fileHint;
  for (const spec of s.specs ?? []) {
    const specFile = spec.file ?? nextFile;
    for (const tr of spec.tests ?? []) {
      const st = lastStatus(tr.results);
      if (specFile) onTest(specFile, st);
    }
  }
  for (const t of s.tests ?? []) {
    const st = lastStatus(t.results);
    if (nextFile) onTest(nextFile, st);
  }
  for (const ch of s.suites ?? []) {
    walkSuite(ch, nextFile, onTest);
  }
}

function basenameFile(f: string): string {
  return path.basename(f);
}

function classify(file: string): string {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean);
  const e2eIndex = parts.lastIndexOf('e2e');
  const folder = e2eIndex >= 0 ? parts[e2eIndex + 1] : parts.length > 1 ? parts[0] : undefined;
  if (!folder || folder.endsWith('.ts')) return 'Other';
  if (folder === 'visual') return 'Visual Regression';
  return folder.replace(
    /(^|-)([a-z])/g,
    (_, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`
  );
}

async function waitForResultsFile(maxMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (existsSync(RESULTS)) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return existsSync(RESULTS);
}

export default async function globalTeardown(): Promise<void> {
  await waitForResultsFile(15_000);
  if (!existsSync(RESULTS)) {
    const fallback = `# Supermarket POS — Playwright Verification Report
**Date:** ${new Date().toISOString().slice(0, 10)}
**Note:** No results.json found — tests may not have run.

## Summary
Run \`npx playwright test\` after configuring \`.env.local\`.
`;
    writeFileSync(REPORT, fallback, 'utf8');
    // eslint-disable-next-line no-console
    console.log('E2E COMPLETE — Pass: 0 | Fail: 0 | Skip: 0 (no results file)');
    return;
  }

  const raw = JSON.parse(readFileSync(RESULTS, 'utf8')) as { suites?: Suite[] };
  const counts = new Map<string, { pass: number; fail: number; skip: number; total: number }>();

  const failures: { title: string; file: string; error: string }[] = [];

  const onTest = (file: string, status: string) => {
    const label = classify(file);
    const c = counts.get(label) ?? { pass: 0, fail: 0, skip: 0, total: 0 };
    counts.set(label, c);
    c.total += 1;
    if (status === 'passed') c.pass += 1;
    else if (status === 'skipped') c.skip += 1;
    else c.fail += 1;
  };

  for (const root of raw.suites ?? []) {
    walkSuite(root, undefined, onTest);
  }

  const walkFailures = (s: Suite, fileHint: string | undefined) => {
    const file = s.file ?? fileHint;
    for (const spec of s.specs ?? []) {
      const specFile = spec.file ?? file;
      for (const tr of spec.tests ?? []) {
        const results = tr.results ?? [];
        const r = results[results.length - 1];
        if (r?.status === 'failed' || r?.status === 'timedOut') {
          failures.push({
            title: spec.title,
            file: basenameFile(specFile ?? 'unknown'),
            error: r.error?.message ?? r.status,
          });
        }
      }
    }
    for (const t of s.tests ?? []) {
      const results = t.results ?? [];
      const r = results[results.length - 1];
      if (r?.status === 'failed' || r?.status === 'timedOut') {
        failures.push({
          title: t.title,
          file: basenameFile(file ?? 'unknown'),
          error: r.error?.message ?? r.status,
        });
      }
    }
    for (const ch of s.suites ?? []) walkFailures(ch, file);
  };
  for (const root of raw.suites ?? []) walkFailures(root, undefined);

  let totalP = 0,
    totalF = 0,
    totalS = 0,
    totalT = 0;
  for (const label of counts.keys()) {
    const c = counts.get(label)!;
    totalP += c.pass;
    totalF += c.fail;
    totalS += c.skip;
    totalT += c.total;
  }

  const pwVersion =
    (
      JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')) as {
        devDependencies?: Record<string, string>;
      }
    ).devDependencies?.['@playwright/test'] ?? 'unknown';

  const lines: string[] = [
    '# Supermarket POS — Playwright Verification Report',
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    `**Playwright version:** ${pwVersion}`,
    '**Browser:** Chromium',
    '',
    '## Summary',
    '| Suite | Total | Pass | Fail | Skip |',
    '|-------|-------|------|------|------|',
  ];

  for (const label of [...counts.keys()].sort()) {
    const c = counts.get(label)!;
    lines.push(
      `| ${label} | ${String(c.total)} | ${String(c.pass)} | ${String(c.fail)} | ${String(c.skip)} |`
    );
  }
  lines.push(
    `| **TOTAL** | ${String(totalT)} | ${String(totalP)} | ${String(totalF)} | ${String(totalS)} |`
  );
  lines.push('');
  lines.push('## Videos');
  lines.push('All videos saved to: `e2e-results/`');
  lines.push('HTML report: `playwright-report/index.html`');
  lines.push('');
  lines.push('## Failures');
  if (failures.length === 0) {
    lines.push('_None._');
  } else {
    for (const f of failures) {
      lines.push('');
      lines.push(`### FAIL: ${f.title}`);
      lines.push(`**File:** e2e/${f.file}`);
      lines.push(`**Error:** ${f.error.replace(/\r?\n/g, ' ')}`);
      lines.push('**Video:** see `e2e-results/` for matching `.webm`');
      lines.push('**Trace:** see `e2e-results/` for matching trace `.zip`');
      lines.push('**Likely cause:** See error message above (selector vs app state vs env).');
    }
  }
  lines.push('');

  writeFileSync(REPORT, lines.join('\n'), 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `E2E COMPLETE — Pass: ${String(totalP)} | Fail: ${String(totalF)} | Skip: ${String(totalS)}`
  );
}
