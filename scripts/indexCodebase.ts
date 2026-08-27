/**
 * indexCodebase.ts — Standalone Node script (not bundled into the app).
 *
 * Globs all .ts/.tsx files in src/, splits into ~400-token chunks at
 * function/component boundaries, generates embeddings via OpenAI
 * text-embedding-3-small (1536 dims), and upserts into pos_codebase_index.
 *
 * Usage:
 *   npm run index-codebase
 *
 * Required env vars (in bar-pos/.env or bar-pos/.env.local):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (service role — bypasses RLS INSERT policy)
 *   OPENAI_API_KEY
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { glob } from 'glob';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ─── Config ──────────────────────────────────────────────────────────────────

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');
const CHUNK_MAX_CHARS = 1600; // ~400 tokens @ ~4 chars/token
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH = 20; // OpenAI allows up to 2048 inputs per request
const UPSERT_BATCH = 50;

const supabaseUrl = process.env['VITE_SUPABASE_URL'];
const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
const openaiKey = process.env['OPENAI_API_KEY'];

if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
  console.error(
    'Missing required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiKey });

// ─── Types ────────────────────────────────────────────────────────────────────

interface Chunk {
  filePath: string;
  chunkText: string;
  metadata: {
    startLine: number;
    endLine: number;
    symbol: string | null;
  };
}

interface IndexRow {
  file_path: string;
  chunk_text: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  indexed_at: string;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

// Regex for top-level declaration boundaries
const BOUNDARY_RE =
  /^(?:export\s+)?(?:async\s+)?(?:function|class|const|type|interface|enum)\s+(\w+)/;

function chunkFile(filePath: string, content: string): Chunk[] {
  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  let chunkLines: string[] = [];
  let chunkStart = 1;
  let currentSymbol: string | null = null;

  const flush = (endLine: number) => {
    const text = chunkLines.join('\n').trim();
    if (text.length < 20) return; // skip near-empty chunks
    chunks.push({
      filePath,
      chunkText: text,
      metadata: { startLine: chunkStart, endLine, symbol: currentSymbol },
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNum = i + 1;
    const match = BOUNDARY_RE.exec(line.trimStart());

    const isNewBoundary = match !== null && i > 0;
    const isOversize = chunkLines.join('\n').length >= CHUNK_MAX_CHARS;

    if ((isNewBoundary || isOversize) && chunkLines.length > 0) {
      flush(lineNum - 1);
      chunkStart = lineNum;
      chunkLines = [];
      currentSymbol = match ? (match[1] ?? null) : null;
    } else if (match && chunkLines.length === 0) {
      currentSymbol = match[1] ?? null;
    }

    chunkLines.push(line);
  }

  if (chunkLines.length > 0) {
    flush(lines.length);
  }

  return chunks;
}

// ─── Embeddings ───────────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

async function upsertRows(rows: IndexRow[]): Promise<void> {
  const { error } = await supabase.from('pos_codebase_index').insert(rows);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning ${SRC_DIR} ...`);

  const files = await glob('**/*.{ts,tsx}', {
    cwd: SRC_DIR,
    ignore: ['**/*.test.ts', '**/*.test.tsx', '**/*.stories.tsx', '**/*.d.ts'],
    absolute: true,
  });

  console.log(`Found ${files.length} source files.`);

  // Collect all chunks
  const allChunks: Chunk[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(SRC_DIR, file).replace(/\\/g, '/');
    const chunks = chunkFile(rel, content);
    allChunks.push(...chunks);
  }

  console.log(`Generated ${allChunks.length} chunks. Clearing old index...`);

  // Delete existing rows for files we're about to re-index
  const uniquePaths = [...new Set(allChunks.map((c) => c.filePath))];
  for (let i = 0; i < uniquePaths.length; i += 100) {
    const batch = uniquePaths.slice(i, i + 100);
    const { error } = await supabase
      .from('pos_codebase_index')
      .delete()
      .in('file_path', batch);
    if (error) console.warn(`Delete warning: ${error.message}`);
  }

  console.log(`Generating embeddings in batches of ${EMBEDDING_BATCH}...`);

  const rows: IndexRow[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < allChunks.length; i += EMBEDDING_BATCH) {
    const batch = allChunks.slice(i, i + EMBEDDING_BATCH);
    const texts = batch.map((c) => `// ${c.filePath}\n${c.chunkText}`);

    process.stdout.write(`\r  ${i + batch.length}/${allChunks.length} chunks embedded...`);

    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embeddings[j];
      if (!chunk || !embedding) continue;
      rows.push({
        file_path: chunk.filePath,
        chunk_text: chunk.chunkText,
        embedding,
        metadata: chunk.metadata as Record<string, unknown>,
        indexed_at: now,
      });
    }
  }

  console.log(`\nUpserting ${rows.length} rows to Supabase...`);

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    await upsertRows(batch);
    process.stdout.write(`\r  ${i + batch.length}/${rows.length} rows inserted...`);
  }

  console.log(`\nDone. ${rows.length} chunks indexed from ${files.length} files.`);
}

main().catch((err) => {
  console.error('Indexer failed:', err);
  process.exit(1);
});
