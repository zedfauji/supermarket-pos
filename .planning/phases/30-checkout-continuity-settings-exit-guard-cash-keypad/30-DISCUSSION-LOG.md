# Phase 30: Checkout Continuity, Settings Exit Guard & Cash Keypad - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 30-checkout-continuity-settings-exit-guard-cash-keypad
**Areas discussed:** Restore experience and stale data, Payment recovery outcomes, Settings exit
details, Cash keypad interaction

---

## Restore Experience and Stale Data

### Q1 — When Checkout is restored, how should the cashier be informed?

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic with banner | Reopen Checkout immediately and explain restoration in a banner. | |
| Require confirmation | Show Resume or Discard before revealing Checkout. | ✓ |
| Restore silently | Reopen the saved state without an interruption. | |

**User's choice:** Require confirmation → D-01

### Q2 — What should the restoration confirmation show?

| Option | Description | Selected |
|--------|-------------|----------|
| Compact summary | Item count, total, payment method, and saved time. | |
| Full basket preview | Every product, quantity, price, total, and saved payment details. | ✓ |
| Simple message | Only state that an unfinished sale exists. | |

**User's choice:** Full basket preview → D-02

### Q3 — How should changed catalog values be handled on Resume?

| Option | Description | Selected |
|--------|-------------|----------|
| Flag changed lines for review | Preserve saved values, show old versus current, and block payment until resolved. | ✓ |
| Refresh automatically | Replace saved values with the current catalog state. | |
| Keep the snapshot | Use all saved values without alerting the cashier. | |

**User's choice:** Flag changed lines for review → D-03

### Q4 — How long should an unfinished sale remain recoverable?

| Option | Description | Selected |
|--------|-------------|----------|
| Until Resume or Discard | Keep it indefinitely until a cashier explicitly resolves it. | |
| Until the caja session closes | Remove it when its owning register session closes. | ✓ |
| For 24 hours | Expire it after a fixed wall-clock interval. | |

**User's choice:** Until the caja session closes → D-04

**Notes:** Earlier exploration also fixed terminal-scoped cashier access, exact Checkout-draft
restoration, sensitive-field exclusions, and clear/cancel cleanup semantics (D-05–D-06).

---

## Payment Recovery Outcomes

### Q5 — What should appear while an interrupted payment is checked?

| Option | Description | Selected |
|--------|-------------|----------|
| Blocking recovery screen | Show the saved-sale summary and disable every payment action. | ✓ |
| Read-only Checkout | Show the full Checkout screen with controls visibly disabled. | |
| Background recovery | Let the cashier continue while status is checked. | |

**User's choice:** Blocking recovery screen → D-07

### Q6 — What happens when the backend confirms payment completed?

| Option | Description | Selected |
|--------|-------------|----------|
| Open recovered receipt immediately | Show the existing receipt and normal receipt actions without auto-printing. | ✓ |
| Show completion summary first | Require an acknowledgement before opening the receipt. | |
| Return to POS first | Clear the sale and show a notification with a receipt link. | |

**User's choice:** Open recovered receipt immediately → D-08

### Q7 — What happens when the saved attempt did not complete?

| Option | Description | Selected |
|--------|-------------|----------|
| Resume for manual retry | Restore values and original idempotency key; cashier presses Pay. | ✓ |
| Retry automatically | Resubmit as soon as the backend confirms it is incomplete. | |
| Start a new attempt | Discard the old identity and generate a new payment key. | |

**User's choice:** Resume for manual retry → D-09

### Q8 — What can the cashier do when payment status is unknown?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay blocked with Retry | Permit status retry or app close only. | ✓ |
| Return to read-only Checkout | Allow inspection and navigation but not payment. | |
| Manager override | Let a manager bypass recovery and continue. | |

**User's choice:** Stay blocked with Retry → D-10

---

## Settings Exit Details

### Q9 — What happens after Save succeeds in an exit dialog?

| Option | Description | Selected |
|--------|-------------|----------|
| Continue the attempted exit | Automatically perform the pending tab switch, navigation, or app close. | ✓ |
| Stay after saving | Save, close the warning, and remain on the current form. | |
| Ask again | Confirm whether to continue after the save completes. | |

**User's choice:** Continue the attempted exit → D-12

### Q10 — Does manually restoring the original value clear dirty state?

| Option | Description | Selected |
|--------|-------------|----------|
| No warning | Compare values and clear dirty when they match the original. | |
| Keep warning | Any edit stays dirty until explicit Save or Discard. | ✓ |
| Clear only after reset | Only a dedicated Reset action clears dirty state. | |

**User's choice:** Keep warning → D-13

### Q11 — How should a failed Save from the exit dialog appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep dialog open | Preserve values, show inline error, and retain Retry/Discard/Stay. | ✓ |
| Return to the form | Close the dialog and show the error on the Settings page. | |
| Retry automatically | Keep retrying without another cashier action. | |

**User's choice:** Keep dialog open → D-14

### Q12 — How should Escape, outside click, or the close control behave?

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as Stay | Cancel the attempted exit and preserve the dirty form. | ✓ |
| Disable implicit dismissal | Ignore those gestures; require an explicit button. | |
| Treat as Discard | Continue the attempted exit and drop the edits. | |

**User's choice:** Treat as Stay → D-15

**Notes:** The three-action guard applies to every editable Settings tab and all in-app/Tauri exit
paths; native browser unload uses the platform warning (D-11).

---

## Cash Keypad Interaction

### Q13 — How should the keypad be presented?

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Keep a 3-column keypad permanently beside or below cash details. | |
| Open on amount focus | Reveal it when amount tendered receives focus. | ✓ |
| Separate modal | Open a dedicated amount-entry dialog. | |

**User's choice:** Open on amount focus → D-16

### Q14 — How should entered digits form the amount?

| Option | Description | Selected |
|--------|-------------|----------|
| Decimal entry | `1`, `0`, `0` becomes `100.00`; use decimal for cents. | ✓ |
| Fixed-cents POS entry | `1`, `0`, `0` becomes `1.00`. | |
| Whole currency only | Do not permit cent entry. | |

**User's choice:** Decimal entry → D-17

### Q15 — What does a digit do after a quick-tender preset?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace the preset | First digit starts a new amount; later digits append. | ✓ |
| Append to the preset | Add the digit to the displayed preset value. | |
| Require Clear first | Disable digit entry until the preset is cleared. | |

**User's choice:** Replace the preset → D-18

### Q16 — How should a hardware keyboard or numpad behave?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror keypad only | Support digits, decimal, Backspace, and Delete; Enter never pays. | ✓ |
| Enter submits payment | Support keypad keys and submit a valid payment with Enter. | |
| Ignore hardware keys | Only on-screen controls change the amount. | |

**User's choice:** Mirror keypad only → D-19

---

## the agent's Discretion

- Persistence key/version and migration mechanics.
- Minimal shared dirty-form registration mechanism.
- Recovery query/RPC and polling implementation details within the fixed outcome state machine.
- Keypad component factoring, responsive popover placement, visual treatment, and translated copy.
- Vitest/Playwright test allocation.

## Deferred Ideas

None — discussion stayed within phase scope.

**Reviewed todos, not folded:** `rename-cargo-package-bar-pos.md` and
`rotate-remote-supabase-db-password.md`; both matched generic keywords only and remain unrelated
standalone tasks.
