import OpenAI from 'openai';
import { logger } from '@shared/lib/logger';
import { supabase } from '@shared/lib/supabase';


interface CodeChunk {
  id: string;
  file_path: string;
  chunk_text: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

// Read lazily so Vitest vi.stubEnv works and unit tests can override per-test
function getApiKey(): string {
  return (import.meta.env['VITE_OPENAI_API_KEY'] as string | undefined) ?? '';
}

function getEmbeddingModel(): string {
  return (import.meta.env['VITE_EMBEDDING_MODEL'] as string | undefined) ?? 'text-embedding-3-small';
}

function getOpenAI(): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    // Renderer process inside a Tauri desktop app — no public network exposure
    dangerouslyAllowBrowser: true,
  });
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: getEmbeddingModel(),
    input: text,
  });
  const data = response.data[0];
  if (!data) throw new Error('rag: embedding API returned no data');
  return data.embedding;
}

/**
 * Retrieves the most relevant codebase chunks for `query` and returns them
 * as a formatted string ready for injection into the agent system prompt.
 *
 * Returns an empty string when the API key is missing or an error occurs —
 * callers should treat a missing context as a graceful degradation.
 */
export async function retrieveContext(query: string, topK = 5): Promise<string> {
  if (!getApiKey()) {
    logger.warn('rag.retrieveContext.no_api_key', {
      hint: 'Add VITE_OPENAI_API_KEY to .env.local to enable RAG context',
    });
    return '';
  }

  try {
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('match_codebase_chunks', {
      // pgvector RPC args are typed as `string` (PostgREST serializes the
      // `vector` column type as its literal text form, e.g. "[0.1,0.2,...]").
      query_embedding: JSON.stringify(embedding),
      match_count: topK,
      similarity_threshold: 0.5,
    });

    if (error) {
      logger.warn('rag.retrieveContext.rpc_error', { detail: error.message });
      return '';
    }

    const chunks: CodeChunk[] = data as CodeChunk[];
    if (chunks.length === 0) return '';

    return formatChunks(chunks);
  } catch (e) {
    logger.warn('rag.retrieveContext.error', { detail: String(e) });
    return '';
  }
}

function formatChunks(chunks: CodeChunk[]): string {
  const parts = chunks.map((c, i) => {
    const meta = c.metadata ?? {};
    const symbol = typeof meta['symbol'] === 'string' ? ` — ${meta['symbol']}` : '';
    const score = c.similarity.toFixed(3);
    return (
      `### [${String(i + 1)}] ${c.file_path}${symbol} (similarity: ${score})\n` +
      `\`\`\`typescript\n${c.chunk_text}\n\`\`\``
    );
  });
  return `## Relevant codebase context\n\n${parts.join('\n\n')}`;
}
