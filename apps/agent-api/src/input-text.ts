// Check decoded text only. Signed webhook bodies and private image uploads
// retain their original Buffer bytes for their own verification/decoding.
export function containsNulText(value: unknown) {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === 'string') { if (current.includes('\u0000')) return true; }
    else if (current && typeof current === 'object' && !Buffer.isBuffer(current)) {
      for (const [key, nested] of Object.entries(current)) {
        if (key.includes('\u0000')) return true;
        pending.push(nested);
      }
    }
  }
  return false;
}
