const koreaOffset = 9 * 60 * 60 * 1000;

/** Retain the original Korea calendar day; February never becomes a new anchor. */
export function periodAt(anchor: Date, index: number) {
  if (!Number.isFinite(anchor.getTime()) || !Number.isSafeInteger(index) || index < 0 || index > 1200)
    throw new RangeError('invalid_billing_period');
  const local = new Date(anchor.getTime() + koreaOffset);
  const boundary = (months: number) => {
    const month = local.getUTCMonth() + months, year = local.getUTCFullYear();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const value = new Date(Date.UTC(year, month, Math.min(local.getUTCDate(), lastDay),
      local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - koreaOffset);
    if (!Number.isFinite(value.getTime())) throw new RangeError('invalid_billing_boundary');
    return value;
  };
  return { startsAt: boundary(index), endsAt: boundary(index + 1) };
}
