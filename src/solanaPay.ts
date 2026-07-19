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
