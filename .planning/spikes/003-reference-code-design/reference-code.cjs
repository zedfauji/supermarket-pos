// Spike 003: reference-code-design
// Pure logic, no deps — run with `node reference-code.js`
//
// Goal: a short numeric code that (a) fits inside SPEI's Banxico-standard
// "referencia numerica" field (<=7 digits, numeric only — Spike 002), and
// (b) catches admin transcription typos when manually confirming a match,
// since the field is hand-typed by the customer and hand-read by admin.
//
// Design: 6 payload digits + 1 Luhn check digit = 7 digits total.

function luhnCheckDigit(payloadDigits) {
  // payloadDigits: string of digits, rightmost-first doubling per Luhn.
  let sum = 0;
  const digits = payloadDigits.split('').reverse();
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

function generateCode(randomFn = Math.random) {
  let payload = '';
  for (let i = 0; i < 6; i++) payload += Math.floor(randomFn() * 10);
  return payload + String(luhnCheckDigit(payload));
}

function isValidCode(code) {
  if (!/^\d{7}$/.test(code)) return false;
  const payload = code.slice(0, 6);
  const check = Number(code[6]);
  return luhnCheckDigit(payload) === check;
}

// Generate a code guaranteed not to collide with currently-pending codes.
// (Banxico's field isn't system-unique — the POS must enforce uniqueness
// only among its own currently-unresolved pending sales.)
function generateUniqueCode(pendingCodes, randomFn = Math.random) {
  let code;
  let attempts = 0;
  do {
    code = generateCode(randomFn);
    attempts++;
    if (attempts > 1000) throw new Error('pending-code space exhausted — widen payload length');
  } while (pendingCodes.has(code));
  return code;
}

module.exports = { luhnCheckDigit, generateCode, isValidCode, generateUniqueCode };

// ---- demo() self-check, run directly ----
if (require.main === module) {
  const assert = require('assert');

  // 1. Every generated code is self-consistent.
  for (let i = 0; i < 1000; i++) {
    const code = generateCode();
    assert.strictEqual(code.length, 7, 'code must be 7 digits');
    assert.ok(isValidCode(code), `generated code ${code} must validate`);
  }

  // 2. Single-digit transcription error is always caught.
  let singleDigitCaught = 0;
  let singleDigitTotal = 0;
  for (let i = 0; i < 500; i++) {
    const code = generateCode();
    for (let pos = 0; pos < 6; pos++) {
      for (let wrong = 0; wrong < 10; wrong++) {
        if (String(wrong) === code[pos]) continue;
        const mutated = code.slice(0, pos) + wrong + code.slice(pos + 1);
        singleDigitTotal++;
        if (!isValidCode(mutated)) singleDigitCaught++;
      }
    }
  }
  assert.strictEqual(singleDigitCaught, singleDigitTotal, 'Luhn must catch 100% of single-digit errors');

  // 3. Adjacent-transposition error is caught in the vast majority of cases
  //    (Luhn's known blind spot: transposing "09" <-> "90" is NOT caught).
  let transposedCaught = 0;
  let transposedTotal = 0;
  for (let i = 0; i < 2000; i++) {
    const code = generateCode();
    const pos = Math.floor(Math.random() * 5); // adjacent pair within payload
    if (code[pos] === code[pos + 1]) continue; // no-op swap, skip
    const swapped =
      code.slice(0, pos) + code[pos + 1] + code[pos] + code.slice(pos + 2);
    transposedTotal++;
    if (!isValidCode(swapped)) transposedCaught++;
  }
  const transposeCatchRate = transposedCaught / transposedTotal;
  assert.ok(
    transposeCatchRate > 0.85,
    `expected >85% adjacent-transposition catch rate, got ${(transposeCatchRate * 100).toFixed(1)}%`
  );

  // 4. Known Luhn blind spot confirmed present (09<->90 swap not caught) —
  //    documents the real ceiling rather than overclaiming 100% typo-safety.
  const blind = '0900001'; // payload "090000", check digit for it below
  const blindPayload = '090000';
  const blindCode = blindPayload + String(luhnCheckDigit(blindPayload));
  const blindSwapped = '900000' + blindCode[6];
  const blindSpotConfirmed = isValidCode(blindCode) && isValidCode(blindSwapped);
  assert.ok(blindSpotConfirmed, 'expected the documented 09<->90 Luhn blind spot to reproduce');

  // 5. Collision avoidance against a pending-code set.
  const pending = new Set([generateCode(), generateCode(), generateCode()]);
  const fresh = generateUniqueCode(pending);
  assert.ok(!pending.has(fresh), 'generateUniqueCode must not return an in-use code');

  console.log('All checks passed.');
  console.log(`  Single-digit error catch rate: 100% (${singleDigitTotal} mutations tested)`);
  console.log(`  Adjacent-transposition catch rate: ${(transposeCatchRate * 100).toFixed(1)}% (${transposedTotal} tested, Luhn's 09<->90 blind spot confirmed present)`);
  console.log(`  Sample codes: ${[generateCode(), generateCode(), generateCode()].join(', ')}`);
}
