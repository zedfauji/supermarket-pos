import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above all imports — use vi.hoisted() for shared mock refs
const { mockRpc, mockEmbeddingCreate, mockLogWarn } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockEmbeddingCreate: vi.fn().mockResolvedValue({
    data: [{ embedding: Array.from({ length: 1536 }, () => 0.1) }],
  }),
  mockLogWarn: vi.fn(),
}));

vi.mock('openai', () => {
  // function keyword required — arrow fn is not constructable with `new`
  function MockOpenAI() {
    return { embeddings: { create: mockEmbeddingCreate } };
  }
  return { default: MockOpenAI };
});

vi.mock('@shared/lib/supabase', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('@shared/lib/logger', () => ({
  logger: { warn: mockLogWarn },
}));

import { retrieveContext } from './rag';

const logWarnMock = mockLogWarn;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChunks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    file_path: `src/shared/lib/agent/tools/file${i}.ts`,
    chunk_text: `export function tool${i}() { /* cash drawer logic */ }`,
    metadata: { symbol: `tool${i}` },
    similarity: 0.9 - i * 0.05,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('retrieveContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key-123');
    mockEmbeddingCreate.mockResolvedValue({
      data: [{ embedding: Array.from({ length: 1536 }, () => 0.1) }],
    });
  });

  it('returns empty string when VITE_OPENAI_API_KEY is missing', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', '');
    const result = await retrieveContext('cash drawer');
    expect(result).toBe('');
    expect(logWarnMock).toHaveBeenCalledWith(
      'rag.retrieveContext.no_api_key',
      expect.objectContaining({ hint: expect.any(String) })
    );
  });

  it('returns empty string when RPC returns no chunks', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const result = await retrieveContext('cash drawer', 5);
    expect(result).toBe('');
  });

  it('returns formatted context string when chunks are found', async () => {
    mockRpc.mockResolvedValue({ data: makeChunks(2), error: null });
    const result = await retrieveContext('cash drawer', 2);
    expect(result).toContain('## Relevant codebase context');
    expect(result).toContain('file0.ts');
    expect(result).toContain('tool0');
    expect(result).toContain('```typescript');
    expect(result).toContain('cash drawer logic');
  });

  it('formats chunk header with symbol from metadata', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        id: 'x',
        file_path: 'src/foo.ts',
        chunk_text: 'function foo() {}',
        metadata: { symbol: 'foo' },
        similarity: 0.85,
      }],
      error: null,
    });
    const result = await retrieveContext('foo', 1);
    expect(result).toContain('src/foo.ts — foo');
    expect(result).toContain('(similarity: 0.850)');
  });

  it('omits symbol label when metadata has none', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        id: 'x',
        file_path: 'src/bar.ts',
        chunk_text: 'const x = 1;',
        metadata: null,
        similarity: 0.7,
      }],
      error: null,
    });
    const result = await retrieveContext('x', 1);
    expect(result).toContain('src/bar.ts (similarity:');
    expect(result).not.toContain(' — ');
  });

  it('returns empty string on RPC error and logs warning', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'pgvector not enabled' } });
    const result = await retrieveContext('anything');
    expect(result).toBe('');
    expect(logWarnMock).toHaveBeenCalledWith(
      'rag.retrieveContext.rpc_error',
      expect.objectContaining({ detail: 'pgvector not enabled' })
    );
  });

  it('returns empty string on unexpected exception and logs warning', async () => {
    mockRpc.mockRejectedValue(new Error('network failure'));
    const result = await retrieveContext('anything');
    expect(result).toBe('');
    expect(logWarnMock).toHaveBeenCalledWith(
      'rag.retrieveContext.error',
      expect.objectContaining({ detail: expect.stringContaining('network failure') })
    );
  });

  it('passes topK to match_codebase_chunks', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await retrieveContext('query', 8);
    expect(mockRpc).toHaveBeenCalledWith(
      'match_codebase_chunks',
      expect.objectContaining({ match_count: 8 })
    );
  });
});
