// Number rules from DESIGN.md §1: compact Indian units for sums, full Indian
// grouping for prices and quantities, U+2212 minus, colour by own sign.

const MINUS = '−';

/** Indian digit grouping: 12,34,567.89 */
export function grp(n: number, decimals = 0): string {
  const [a, d] = Math.abs(n).toFixed(decimals).split('.');
  const last3 = a.slice(-3);
  const rest = a.slice(0, -3);
  return (rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3 + (d ? '.' + d : '');
}

/** ₹X.XX Cr from 1e7, ₹X.XX L from 1e5, else full ₹ — unsigned. */
export function rsAbs(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return '₹' + (a / 1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return '₹' + (a / 1e5).toFixed(2) + ' L';
  return '₹' + grp(Math.round(a));
}

/** Signed amount: +₹1.20 L / −₹45,000 / ₹0 */
export function rsSigned(v: number): string {
  if (Math.abs(v) < 1) return '₹0';
  return (v > 0 ? '+' : MINUS) + rsAbs(v);
}

/** Unsigned amount with "—" for zero (e.g. margin on long options). */
export const rsOrDash = (v: number) => (Math.abs(v) < 1 ? '—' : rsAbs(v));

/** Unit price: ₹1,813.57, or ₹13,368 from 1,000 up. */
export const px = (v: number) => '₹' + grp(v, Math.abs(v) >= 1000 ? 0 : 2);

export function pctSigned(v: number, decimals = 2): string {
  if (Math.abs(v) < 0.5 * 10 ** -decimals) return (0).toFixed(decimals) + '%';
  return (v > 0 ? '+' : MINUS) + Math.abs(v).toFixed(decimals) + '%';
}

/** Colour for a signed value: flat is muted, never green. */
export const signColor = (v: number | null | undefined, eps = 1) =>
  v == null || Math.abs(v) < eps ? 'var(--ink-muted)' : v > 0 ? 'var(--positive)' : 'var(--negative)';

export const signedQty = (n: number, decimals = 0) => (n > 0 ? '+' : n < 0 ? MINUS : '') + grp(n, decimals);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-27" → "27 Oct" */
export const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
