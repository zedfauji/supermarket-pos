import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBarcodeScanner } from './useBarcodeScanner';

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('useBarcodeScanner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onScan with the buffered code when Enter follows rapid keys', () => {
    const onScan = vi.fn();
    renderHook(() => {
      useBarcodeScanner({ onScan });
    });

    act(() => {
      '1234567'.split('').forEach(k => {
        pressKey(k);
      });
      pressKey('Enter');
    });

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('1234567');
  });

  it('ignores buffers shorter than minLength', () => {
    const onScan = vi.fn();
    renderHook(() => {
      useBarcodeScanner({ onScan, minLength: 6 });
    });

    act(() => {
      '123'.split('').forEach(k => {
        pressKey(k);
      });
      pressKey('Enter');
    });

    expect(onScan).not.toHaveBeenCalled();
  });

  it('resets the buffer when there is a long gap between keys', async () => {
    vi.useFakeTimers();
    const onScan = vi.fn();
    renderHook(() => {
      useBarcodeScanner({ onScan, maxGapMs: 10 });
    });

    act(() => {
      pressKey('1');
      pressKey('2');
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      pressKey('3');
      pressKey('4');
      pressKey('5');
      pressKey('6');
      pressKey('Enter');
    });

    // Only the post-gap keys should survive in the buffer.
    expect(onScan).toHaveBeenCalledWith('3456');
  });
});
