import { create } from 'zustand';

interface LockState {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

/**
 * Single source of truth for "is the screen currently locked" within this
 * window's JS realm, so any module (e.g. CheckoutPanel's global
 * useBarcodeScanner listener, or shared/ui's ConfirmDialog/WeightEntryDialog
 * global keydown listeners) can read it without prop-drilling from App.tsx
 * down through the FSD layers. Lives in shared/lib (not
 * features/idle-screen-lock) specifically so shared/ui components can depend
 * on it without inverting the FSD import direction (app -> pages -> widgets
 * -> features -> entities -> shared). Deliberately no `persist` middleware --
 * lock state is a live, per-session UI flag, not something that should
 * survive a reload (IdleLockProvider re-arms the idle timer fresh on every
 * mount).
 *
 * Not shared across Tauri OS windows (e.g. the Product Peek window) -- each
 * window has its own JS realm and its own instance of this store. See
 * 21-RESEARCH.md Open Question 1 / 21-02-PLAN.md's flagged assumption for why
 * ProductPeekWindow is deliberately NOT gated on this store.
 */
export const useLockStateStore = create<LockState>()(set => ({
  locked: false,
  setLocked: locked => {
    set({ locked });
  },
}));
