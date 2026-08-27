/**
 * E2E multi-window Tauri IPC mock for the barcode-scan product peek window
 * (Phase 18, PEEK-01..04).
 *
 * Extends the exact dual-global shape already proven in
 * `e2e/receipts/reprint.spec.ts`'s `injectPrintMock` (`window.__TAURI__` +
 * `window.__TAURI_INTERNALS__.invoke`), adding a `BroadcastChannel` bridge so
 * two Playwright `Page`s in the same `BrowserContext` (standing in for the
 * real "main" and "peek" `WebviewWindow`s) can relay `emit`/`listen` calls to
 * each other — the closest same-process analog to Tauri's real cross-window
 * event relay, since both pages load the same origin
 * (18-RESEARCH.md "E2E: simulating a second OS window with a
 * BroadcastChannel-backed Tauri IPC mock").
 *
 * Confirmed exact IPC command strings and required globals by reading the
 * compiled `node_modules/@tauri-apps/api/*.js` sources this session:
 *   core.js         -> window.__TAURI_INTERNALS__.invoke/transformCallback/unregisterCallback
 *   event.js        -> invoke('plugin:event|listen'|'unlisten'|'emit'|'emit_to', ...)
 *   webviewWindow.js -> invoke('plugin:webview|create_webview_window', ...), invoke('plugin:window|get_all_windows')
 *   window.js       -> invoke('plugin:window|close'|'hide'|'show'|'set_focus', ...)
 *   webview.js      -> getCurrentWebview() reads window.__TAURI_INTERNALS__.metadata.currentWebview.label (sync property access, not invoke)
 */
import type { Page } from '@playwright/test';

export async function injectPeekWindowMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__TAURI__'] = {};
    // Append-only call log so a test can assert on ANY invoke() call (e.g. a
    // plugin:window|hide after "Close"), not just the most recent one —
    // extends reprint.spec.ts's single-value __lastPrintedLines convention.
    (window as unknown as Record<string, unknown>)['__peekMockCalls'] = [];
    // listen()'s returned unlisten() callback synchronously reads this
    // global (event.js's _unlisten) before it ever calls invoke() — React
    // 18 StrictMode's dev-mode mount/unmount/remount double-invoke means
    // this fires on every listener-registering effect, not just on a real
    // page/component unmount, so it must exist unconditionally.
    (window as unknown as Record<string, unknown>)['__TAURI_EVENT_PLUGIN_INTERNALS__'] = {
      unregisterListener: () => undefined,
    };

    // Real Tauri backend relays events across windows; a BroadcastChannel of
    // the same origin/browser context is the closest same-process stand-in
    // for that relay between two Playwright Pages representing "main" and
    // "peek".
    const bus = new BroadcastChannel('tauri-peek-mock');
    const listeners = new Map<number, { event: string; cb: (arg: unknown) => void }>();
    let nextId = 1;

    bus.onmessage = (msg: MessageEvent<{ event: string; payload: unknown }>) => {
      for (const { event, cb } of listeners.values()) {
        if (event === msg.data.event) cb({ event: msg.data.event, id: 0, payload: msg.data.payload });
      }
    };

    (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
      // `getCurrentWebview()`/`getCurrentWindow()` read this synchronously
      // (not via invoke) to construct the current Window/Webview labels.
      // The label value itself is never asserted on by this mock or its
      // consumers — every invoke() handler below records/acks by command
      // name only, never by window label.
      metadata: {
        currentWindow: { label: 'mock' },
        currentWebview: { label: 'mock' },
      },
      invoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
        (
          (window as unknown as Record<string, unknown>)['__peekMockCalls'] as {
            cmd: string;
            args: unknown;
          }[]
        ).push({ cmd, args });

        if (cmd === 'plugin:event|listen') {
          const id = nextId++;
          const callbackId = args['handler'] as number;
          listeners.set(id, {
            event: args['event'] as string,
            cb: payload => {
              const cb = (window as unknown as Record<string, unknown>)[`_${String(callbackId)}`];
              if (typeof cb === 'function') (cb as (arg: unknown) => void)(payload);
            },
          });
          return Promise.resolve(id);
        }
        if (cmd === 'plugin:event|emit') {
          bus.postMessage({ event: args['event'], payload: args['payload'] });
          return Promise.resolve(null);
        }
        // Must actually remove the listener — React 18 StrictMode's dev-mode
        // mount/cleanup/remount double-invoke means every listen()-registering
        // effect unlistens once before its "real" mount; without this, the
        // stale first-mount listener stays in the Map forever and the next
        // broadcast fires BOTH the stale and live callback, double-applying
        // every relayed add-to-cart/rescan event.
        if (cmd === 'plugin:event|unlisten') {
          listeners.delete(args['eventId'] as number);
          return Promise.resolve(null);
        }
        // plugin:window|get_all_windows: WebviewWindow.getByLabel() maps
        // over the result — must resolve an array, not null, or the
        // production ensurePeekWindowShown() call throws (uncaught
        // rejection -> fails fixtures.ts's zero-pageerror assertion). The
        // test itself drives real window count via context.newPage(), not
        // this mock, so an empty list (no other window ever "exists" from
        // this window's perspective) is always correct here.
        if (cmd === 'plugin:window|get_all_windows') {
          return Promise.resolve([]);
        }
        // create_webview_window / close / hide / show / set_focus: the TEST
        // itself drives window count via context.newPage(), not this mock —
        // just acknowledge so the calling JS's await doesn't hang. Already
        // recorded above for assertion (e.g. a plugin:window|hide call).
        return Promise.resolve(null);
      },
      transformCallback(callback: (arg: unknown) => void): number {
        const id = Math.floor(Math.random() * 1_000_000);
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = callback;
        return id;
      },
      unregisterCallback(id: number): void {
        (window as unknown as Record<string, unknown>)[`_${String(id)}`] = undefined;
      },
    };
  });
}

export async function getPeekMockCalls(
  page: Page,
  cmd?: string
): Promise<{ cmd: string; args: unknown }[]> {
  return page.evaluate(filterCmd => {
    const calls = (window as unknown as Record<string, unknown>)['__peekMockCalls'] as
      | { cmd: string; args: unknown }[]
      | undefined;
    const all = calls ?? [];
    return filterCmd ? all.filter(c => c.cmd === filterCmd) : all;
  }, cmd);
}
