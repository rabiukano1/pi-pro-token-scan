// Solana Pay transfer-request URLs: https://docs.solanapay.com/spec
// solana:<recipient>?spl-token=<mint>&label=<name>

export interface PayFields {
  recipient: string; // receiver's wallet address
  mint: string; // token contract (mint) address
  label: string; // wallet owner name
  amount?: string; // optional fixed amount; sender types it when omitted
}

// Fixed PIPRO token contract (mint). Never changes — the QR always transfers
// this token, so senders can't be tricked into a different one.
export const PIPRO_MINT = '7hU4hrLtr2dxGDBy56HQo6NF2u19FA1k4rM8nJQ5ceFk';

// ⚠ TEST TOKEN — devnet only, NOT real PIPRO.
// Present so the flow can be exercised without holding real tokens. It is
// deliberately never reported as a verified PIPRO card; scanning it shows a
// test warning instead. Set to null before sharing the APK with the community.
// ponytail: hardcoded test mint, swap for a build flag if testing outlives this
export const TEST_MINT: string | null =
  '8wy5Jff7KxNDAGSRcFyZQEYMhL8FWi5rh9jU51tkBLLd';

// https:// landing page that redirects into whichever wallet is installed.
// Sending the raw "solana:" link as chat text doesn't work — WhatsApp/Telegram
// only auto-link http(s), so a custom scheme just sits there as dead text.
// This page IS a real link (tappable everywhere) and hands off to any wallet
// that registers for "solana:" — not locked to one wallet's own link format.
export const PAY_BASE_URL = 'https://rabiukano1.github.io/pi-pro-token-scan/pay.html';

// mint is deliberately not a parameter: the page only ever picks between its
// own two hardcoded mints (real or test) via the boolean `test` flag below —
// never an arbitrary one from the URL.
// Query string built by hand, not URLSearchParams — Hermes doesn't have a
// working implementation (see parseUrl below for the same constraint).
export function buildWebLink({
  recipient,
  label,
  amount,
  test,
}: Omit<PayFields, 'mint'> & {test?: boolean}): string {
  if (!isBase58Address(recipient)) {
    throw new Error('Invalid wallet address');
  }
  let qs = `to=${recipient}`;
  if (label.trim()) {
    qs += `&label=${encodeURIComponent(label.trim())}`;
  }
  if (amount) {
    qs += `&amount=${amount}`;
  }
  if (test) {
    qs += '&test=1';
  }
  return `${PAY_BASE_URL}?${qs}`;
}

// Association identity printed on every generated card.
export const ASSOCIATION = 'PI PRO AREWA ASSOCIATION';
export const MOTTO = 'MOTTO: BAHAUSE BA WASABA';

// A marchant card carries an authorization claim that an ordinary member must
// never display, so the wording is separated per type. The payment URL is
// identical either way — only the card text differs.
export type QrType = 'marchant' | 'member';

export const QR_TYPES: Record<
  QrType,
  {tab: string; nameLabel: string; badge: string; note: string}
> = {
  marchant: {
    tab: 'Marchant',
    nameLabel: 'Marchant / wallet owner name',
    badge: '✓ Authorized Marchant by PIPRO',
    note:
      'Scan with your Solana wallet to send verified PIPRO tokens safely — ' +
      'no fakes, no wrong addresses.',
  },
  member: {
    tab: 'Member',
    nameLabel: 'Member name',
    badge: '✓ PIPRO Community Member',
    note:
      'Scan with your Solana wallet to send this member PIPRO tokens safely — ' +
      'no fakes, no wrong addresses.',
  },
};

// ponytail: base58 charset+length check only; add full base58 decode + curve
// check if malformed-but-plausible addresses become a real problem.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const isBase58Address = (s: string): boolean => BASE58.test(s);

export function buildUrl({recipient, mint, label, amount}: PayFields): string {
  if (!isBase58Address(recipient)) {
    throw new Error('Invalid wallet address');
  }
  if (!isBase58Address(mint)) {
    throw new Error('Invalid token contract address');
  }
  const amountPart = amount ? `&amount=${amount}` : '';
  return `solana:${recipient}?spl-token=${mint}${amountPart}&label=${encodeURIComponent(
    label.trim(),
  )}`;
}

// Incoming deep link from another app:
//   pipro://generate?wallet=<address>&name=<label>&amount=<number>
//   pipro://scan
// Returns null for links we don't handle, so callers can ignore them safely.
export interface DeepLink {
  screen: 'generate' | 'scan';
  wallet?: string;
  name?: string;
  amount?: string;
}

export function parseDeepLink(raw: string): DeepLink | null {
  const m = /^pipro:\/\/(generate|scan)(?:\?(.*))?$/i.exec(raw.trim());
  if (!m) {
    return null;
  }
  const screen = m[1].toLowerCase() as 'generate' | 'scan';
  const params: Record<string, string> = {};
  for (const kv of (m[2] ?? '').split('&')) {
    const eq = kv.indexOf('=');
    if (eq > 0) {
      try {
        params[kv.slice(0, eq).toLowerCase()] = decodeURIComponent(
          kv.slice(eq + 1),
        );
      } catch {
        return null; // malformed percent-encoding
      }
    }
  }
  // Only trust a wallet address that passes the same check as manual entry.
  const wallet = isBase58Address(params.wallet ?? '') ? params.wallet : undefined;
  const amount = /^\d+(\.\d+)?$/.test(params.amount ?? '')
    ? params.amount
    : undefined;
  return {screen, wallet, name: params.name, amount};
}

// A scanned QR is only a genuine PIPRO card if it transfers the PIPRO mint.
// "wrong-token" is kept separate from "invalid" so the app can warn that the
// card is a fake rather than merely unreadable.
export type CardCheck =
  | {status: 'valid'; fields: PayFields}
  | {status: 'test-token'; fields: PayFields}
  | {status: 'wrong-token'; mint: string}
  | {status: 'invalid'};

export function checkCard(raw: string): CardCheck {
  const fields = parseUrl(raw);
  if (!fields) {
    return {status: 'invalid'};
  }
  if (fields.mint === PIPRO_MINT) {
    return {status: 'valid', fields};
  }
  // Separate status, never 'valid': a test token must not be presented to
  // anyone as a genuine PIPRO card.
  if (TEST_MINT && fields.mint === TEST_MINT) {
    return {status: 'test-token', fields};
  }
  return {status: 'wrong-token', mint: fields.mint};
}

// Returns null for anything that is not a well-formed SPL-token transfer URL.
// Never let a scanned QR redirect anywhere except a solana: transfer.
export function parseUrl(raw: string): PayFields | null {
  const m = /^solana:([1-9A-HJ-NP-Za-km-z]{32,44})\?(.+)$/.exec(raw.trim());
  if (!m) {
    return null;
  }
  // Manual query parsing: RN/Hermes has no working URLSearchParams.
  const params: Record<string, string> = {};
  for (const kv of m[2].split('&')) {
    const eq = kv.indexOf('=');
    if (eq > 0) {
      try {
        params[kv.slice(0, eq)] = decodeURIComponent(kv.slice(eq + 1));
      } catch {
        return null; // malformed percent-encoding
      }
    }
  }
  const mint = params['spl-token'] ?? '';
  if (!isBase58Address(mint)) {
    return null;
  }
  return {recipient: m[1], mint, label: params.label ?? ''};
}
