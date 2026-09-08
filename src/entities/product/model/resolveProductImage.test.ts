import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock('@shared/lib/logger-instance', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@shared/lib/logger-instance';
import { supabase } from '@shared/lib/supabase';
import { pickProductImage, resolveProductImageUrl, signProductPhoto } from './resolveProductImage';

function mockCreateSignedUrl(result: { data: { signedUrl: string } | null; error: { message: string } | null }): void {
  const fromImpl = { createSignedUrl: vi.fn().mockResolvedValue(result) };
  (supabase.storage.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fromImpl);
}

describe('pickProductImage', () => {
  it('prefers a resolved signed URL over imageUrl', () => {
    expect(pickProductImage({ signedUrl: 'https://signed', imageUrl: 'https://legacy' })).toBe(
      'https://signed'
    );
  });

  it('falls back to imageUrl when there is no signed URL', () => {
    expect(pickProductImage({ signedUrl: null, imageUrl: 'https://legacy' })).toBe(
      'https://legacy'
    );
  });

  it('returns null when both are null', () => {
    expect(pickProductImage({ signedUrl: null, imageUrl: null })).toBeNull();
  });
});

describe('resolveProductImageUrl', () => {
  it('photoPath set + imageUrl set: resolves to the signed URL derived from photoPath', async () => {
    mockCreateSignedUrl({ data: { signedUrl: 'https://signed.example/photo.webp' }, error: null });
    const url = await resolveProductImageUrl({
      photoPath: 'products/p1/abc.webp',
      imageUrl: 'https://legacy.example/old.jpg',
    });
    expect(url).toBe('https://signed.example/photo.webp');
  });

  it('photoPath null + imageUrl set: returns imageUrl unchanged', async () => {
    const url = await resolveProductImageUrl({ photoPath: null, imageUrl: 'https://legacy.example/old.jpg' });
    expect(url).toBe('https://legacy.example/old.jpg');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it('both null: returns null', async () => {
    const url = await resolveProductImageUrl({ photoPath: null, imageUrl: null });
    expect(url).toBeNull();
  });

  it('photoPath set but signer errors: falls through to imageUrl', async () => {
    mockCreateSignedUrl({ data: null, error: { message: 'not found' } });
    const url = await resolveProductImageUrl({
      photoPath: 'products/p1/missing.webp',
      imageUrl: 'https://legacy.example/old.jpg',
    });
    expect(url).toBe('https://legacy.example/old.jpg');
  });

  it('photoPath set but signer errors and imageUrl is also null: returns null, never a broken path string', async () => {
    mockCreateSignedUrl({ data: null, error: { message: 'not found' } });
    const url = await resolveProductImageUrl({ photoPath: 'products/p1/missing.webp', imageUrl: null });
    expect(url).toBeNull();
  });
});

describe('signProductPhoto', () => {
  it('returns ok(signedUrl) on success', async () => {
    mockCreateSignedUrl({ data: { signedUrl: 'https://signed.example/x.webp' }, error: null });
    const result = await signProductPhoto('products/p1/x.webp');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('https://signed.example/x.webp');
  });

  it('returns err and logs on Storage error', async () => {
    mockCreateSignedUrl({ data: null, error: { message: 'denied' } });
    const result = await signProductPhoto('products/p1/x.webp');
    expect(result.ok).toBe(false);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.error).toHaveBeenCalled();
  });
});
