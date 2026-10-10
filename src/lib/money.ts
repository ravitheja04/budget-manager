/**
 * Money is stored as whole paise (integers) so totals never pick up rounding
 * errors, and shown in rupees with Indian digit grouping (1,25,000).
 */

/** Groups the digits of a whole number the Indian way: 12345678 -> "1,23,45,678". */
function groupIndian(whole: string) {
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/**
 * 12550 paise -> "₹125.50"; whole rupees drop the paise: 1250000 -> "₹12,500".
 * `sign` adds "+" for positive amounts (income).
 */
export function formatMoney(paise: number, opts: { sign?: boolean; symbol?: boolean } = {}) {
  const { sign = false, symbol = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const text = groupIndian(String(rupees)) + (fraction ? `.${String(fraction).padStart(2, '0')}` : '');
  const prefix = negative ? '−' : sign && abs > 0 ? '+' : '';
  return `${prefix}${symbol ? '₹' : ''}${text}`;
}

/** Short form for tiles and charts: "₹950", "₹12.5K", "₹1.25 L", "₹2.4 Cr". */
export function formatMoneyShort(paise: number) {
  const negative = paise < 0;
  const rupees = Math.abs(paise) / 100;
  const trim = (n: number) => String(Number(n.toFixed(2)));
  let text: string;
  if (rupees >= 1e7) text = `${trim(rupees / 1e7)} Cr`;
  else if (rupees >= 1e5) text = `${trim(rupees / 1e5)} L`;
  else if (rupees >= 1e3) text = `${trim(rupees / 1e3)}K`;
  else text = trim(rupees);
  return `${negative ? '−' : ''}₹${text}`;
}

/**
 * What someone typed -> paise, or null if it isn't an amount.
 * Accepts "1,25,000", "₹ 450.5", "1.5L", "2 cr", "12k".
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '').toLowerCase();
  const match = /^(\d+(?:\.\d+)?|\.\d+)(k|l|lakh|lakhs|lac|cr|crore|crores)?$/.exec(cleaned);
  if (!match) return null;
  const unit = match[2];
  const factor = !unit ? 1 : unit === 'k' ? 1e3 : unit.startsWith('l') ? 1e5 : 1e7;
  return Math.round(Number(match[1]) * factor * 100);
}

/** Paise -> the plain text an input box should show when editing ("1250.5"). */
export function moneyInputText(paise: number | null | undefined) {
  if (paise === null || paise === undefined) return '';
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/** "8.5" -> 8.5 (percent per year), or null. */
export function parseRate(text: string): number | null {
  const n = Number(text.replace(/[%\s]/g, ''));
  return text.trim() && Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
}
