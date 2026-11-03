export function normalizePhone(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits;
}

export function samePhone(left, right) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  return Boolean(a && b && a === b);
}
