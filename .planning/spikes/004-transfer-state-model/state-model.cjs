// Spike 004: transfer-payment-state-model
// Standalone in-memory mock of the state machine + RBAC gate — proves the
// design fits the project's existing patterns (payments/tabs/audit_logs,
// cashier < manager < admin hierarchy, refund-style manager-PIN gate)
// without touching the real Supabase schema. Run with `node state-model.cjs`.

const { generateUniqueCode, isValidCode } = require('../003-reference-code-design/reference-code.cjs');

// Mirrors src/shared/lib/rbac.ts's role hierarchy (cashier < manager < admin).
const ROLE_RANK = { cashier: 0, manager: 1, admin: 2 };
function hasRole(role, minRole) {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

// States: pending -> confirmed | disputed | expired
// (mirrors the existing refund/reopen-tab pattern: cashier-originated action,
// manager+ gated terminal action, every transition audit-logged)
const STATES = ['pending', 'confirmed', 'disputed', 'expired'];

class TransferPaymentStore {
  constructor() {
    this.sales = new Map(); // saleId -> { referenceCode, amount, status, customerName, customerPhone, createdAt, ... }
    this.pendingCodes = new Set();
    this.auditLog = [];
  }

  // Cashier action — mirrors checkout-sale / hold-sale: any authenticated staff can mark a
  // sale as awaiting bank transfer, same as any cashier can create an order today.
  markPendingTransfer({ saleId, amount, customerName, customerPhone, actorRole, actorId }) {
    if (!hasRole(actorRole, 'cashier')) {
      throw new Error('AUTH_FORBIDDEN: staff role required');
    }
    if (this.sales.has(saleId)) {
      throw new Error('DUPLICATE_ENTRY: sale already has a transfer record');
    }
    const referenceCode = generateUniqueCode(this.pendingCodes);
    this.pendingCodes.add(referenceCode);
    const record = {
      saleId,
      referenceCode,
      amount,
      customerName,
      customerPhone,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: actorId,
      confirmedBy: null,
      confirmedAt: null,
    };
    this.sales.set(saleId, record);
    this._audit('transfer_marked_pending', actorId, saleId, { referenceCode, amount });
    return { ...record };
  }

  // Manager+ gated terminal action — mirrors process_refund / reopen_tab (CLAUDE.md RBAC table).
  // ALWAYS a manual tap, even for an "obvious" unambiguous match (MANIFEST requirement) — there
  // is deliberately no auto-confirm path anywhere in this store.
  confirmTransfer({ saleId, enteredCode, actorRole, actorId }) {
    if (!hasRole(actorRole, 'manager')) {
      throw new Error('AUTH_FORBIDDEN: manager+ required to confirm a bank transfer');
    }
    const record = this.sales.get(saleId);
    if (!record) throw new Error('NOT_FOUND: no pending transfer for this sale');
    if (record.status !== 'pending') {
      throw new Error(`TAB_ALREADY_CLOSED: transfer already ${record.status}`);
    }
    if (!isValidCode(enteredCode)) {
      throw new Error('VALIDATION_ERROR: entered code fails check-digit validation (likely a typo)');
    }
    if (enteredCode !== record.referenceCode) {
      throw new Error('VALIDATION_ERROR: entered code does not match this sale\'s reference code');
    }
    record.status = 'confirmed';
    record.confirmedBy = actorId;
    record.confirmedAt = new Date().toISOString();
    this.pendingCodes.delete(record.referenceCode);
    this._audit('transfer_confirmed', actorId, saleId, { referenceCode: record.referenceCode });
    return { ...record };
  }

  disputeTransfer({ saleId, reason, actorRole, actorId }) {
    if (!hasRole(actorRole, 'manager')) {
      throw new Error('AUTH_FORBIDDEN: manager+ required to dispute a bank transfer');
    }
    const record = this.sales.get(saleId);
    if (!record) throw new Error('NOT_FOUND: no pending transfer for this sale');
    if (record.status !== 'pending') {
      throw new Error(`TAB_ALREADY_CLOSED: transfer already ${record.status}`);
    }
    if (!reason) throw new Error('VALIDATION_ERROR: dispute requires a reason (audit trail)');
    record.status = 'disputed';
    this.pendingCodes.delete(record.referenceCode);
    this._audit('transfer_disputed', actorId, saleId, { reason });
    return { ...record };
  }

  // Daily follow-up list (Spike 005 feeds off this) — everything not yet resolved.
  listPending() {
    return [...this.sales.values()].filter((r) => r.status === 'pending');
  }

  listAll() {
    return [...this.sales.values()];
  }

  _audit(action, actorId, saleId, metadata) {
    this.auditLog.push({
      action,
      actorId,
      saleId,
      metadata,
      at: new Date().toISOString(),
    });
  }
}

module.exports = { TransferPaymentStore, hasRole, STATES };

// ---- demo() self-check, run directly ----
if (require.main === module) {
  const assert = require('assert');
  const store = new TransferPaymentStore();

  // 1. Cashier can mark a sale pending; gets a valid, unique reference code.
  const rec1 = store.markPendingTransfer({
    saleId: 'sale-1',
    amount: 450,
    customerName: 'Maria Lopez',
    customerPhone: '+52 55 1234 5678',
    actorRole: 'cashier',
    actorId: 'staff-cashier-1',
  });
  assert.ok(isValidCode(rec1.referenceCode));
  assert.strictEqual(rec1.status, 'pending');

  // 2. Cashier CANNOT confirm their own pending transfer — manager+ gate enforced.
  assert.throws(
    () => store.confirmTransfer({ saleId: 'sale-1', enteredCode: rec1.referenceCode, actorRole: 'cashier', actorId: 'staff-cashier-1' }),
    /AUTH_FORBIDDEN/
  );

  // 3. Manager entering a mistyped code (fails Luhn) is rejected before ever comparing to the sale.
  const mistyped = rec1.referenceCode.slice(0, 6) + String((Number(rec1.referenceCode[6]) + 1) % 10);
  assert.throws(
    () => store.confirmTransfer({ saleId: 'sale-1', enteredCode: mistyped, actorRole: 'manager', actorId: 'staff-manager-1' }),
    /VALIDATION_ERROR/
  );

  // 4. Manager entering the CORRECT code confirms it — always a manual tap, no auto-confirm path exists.
  const confirmed = store.confirmTransfer({ saleId: 'sale-1', enteredCode: rec1.referenceCode, actorRole: 'manager', actorId: 'staff-manager-1' });
  assert.strictEqual(confirmed.status, 'confirmed');
  assert.strictEqual(confirmed.confirmedBy, 'staff-manager-1');

  // 5. Cannot double-confirm an already-resolved sale.
  assert.throws(
    () => store.confirmTransfer({ saleId: 'sale-1', enteredCode: rec1.referenceCode, actorRole: 'manager', actorId: 'staff-manager-1' }),
    /TAB_ALREADY_CLOSED/
  );

  // 6. A second, still-open sale for the SAME amount (ambiguous case from the align checkpoint)
  //    gets its own distinct code — collision-proof even for identical amounts same evening.
  const rec2 = store.markPendingTransfer({ saleId: 'sale-2', amount: 450, customerName: 'Juan Perez', customerPhone: '+52 55 8765 4321', actorRole: 'cashier', actorId: 'staff-cashier-1' });
  assert.notStrictEqual(rec1.referenceCode, rec2.referenceCode);

  // 7. Admin can also confirm (role hierarchy: admin >= manager).
  const rec3 = store.markPendingTransfer({ saleId: 'sale-3', amount: 200, customerName: 'Ana Ruiz', customerPhone: '+52 55 1111 2222', actorRole: 'cashier', actorId: 'staff-cashier-1' });
  const disputed = store.disputeTransfer({ saleId: 'sale-3', reason: 'no matching transfer found by end of day', actorRole: 'admin', actorId: 'staff-admin-1' });
  assert.strictEqual(disputed.status, 'disputed');

  // 8. Pending list only shows what's actually unresolved.
  const pending = store.listPending();
  assert.strictEqual(pending.length, 1); // only sale-2 remains pending
  assert.strictEqual(pending[0].saleId, 'sale-2');

  // 9. Every state transition left an audit trail (mirrors recordAudit() usage pattern, CLAUDE.md).
  assert.strictEqual(store.auditLog.length, 5); // 3x mark_pending + 1x confirm + 1x dispute
  const actions = store.auditLog.map((e) => e.action);
  assert.ok(actions.includes('transfer_marked_pending'));
  assert.ok(actions.includes('transfer_confirmed'));
  assert.ok(actions.includes('transfer_disputed'));

  console.log('All checks passed.');
  console.log(`  Sales tracked: ${store.listAll().length}, pending: ${store.listPending().length}, audit entries: ${store.auditLog.length}`);
  console.log('  Confirmed record:', confirmed);
}
