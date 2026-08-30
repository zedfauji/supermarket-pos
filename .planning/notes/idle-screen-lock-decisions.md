---
title: Idle Screen Lock — exploration decisions
date: 2026-08-30
context: /gsd-explore session, routed to Phase 21 (v1.7) + REQUIREMENTS.md LCK-01..04
---

Decisions locked in during Socratic exploration, before Phase 21 planning:

- **Scope is universal, no exemptions.** Idle-lock engages on every screen, every role including
  admin, even mid-transaction (open cart, payment modal). User was explicit: "Everywhere." Do not
  plan a carve-out for in-progress checkout state — that was considered and rejected.

- **Config is per-terminal, not global.** Mirrors the `receipt_settings` pattern (one row per
  terminal) rather than a single app-wide value like the near-expiry-alert setting. Admin-only
  edit (`manage_settings`).

- **Default timeout: 60 seconds.** Configurable, no stated min/max range yet — leave the range
  decision to planning unless the user narrows it further.

- **Unlock is "any valid staff PIN," not "same user."** This is a screen lock, not a re-login:
  whoever enters a correct PIN unlocks it, but the active session's identity does NOT change —
  the originally logged-in staff member stays the session owner. Explicit user quote: "anyone
  unlock, but session stays as original user."

- **Both lock and unlock events go to `audit_logs`.** Record who the session owner was (the
  locked-out user) and, on unlock, which staff member's PIN actually unlocked it — these can
  differ. User was explicit this needs full accountability trail, not just a boolean.

No research pass was needed — idle-detection (activity listeners + timer) and PIN-entry UI
(`ManagerPinDialog` already exists in the codebase) are both established patterns here, not
open unknowns.
