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

// Testing done — set to null so scanning a test-mint QR is treated as an
// ordinary wrong-token card instead of a recognized test card.
export const TEST_MINT: string | null = null;

// https:// landing page that redirects into whichever wallet is installed.
// Sending the raw "solana:" link as chat text doesn't work — WhatsApp/Telegram
// only auto-link http(s), so a custom scheme just sits there as dead text.
// This page IS a real link (tappable everywhere) and hands off to any wallet
// that registers for "solana:" — not locked to one wallet's own link format.
export const PAY_BASE_URL = 'https://rabiukano1.github.io/pi-pro-token-scan/p.html';

// mint is deliberately not a parameter: the page always uses the locked
// PIPRO_MINT, so a shared link can't be edited to redirect payment to a
// different token.
// Query string built by hand, not URLSearchParams — Hermes doesn't have a
// working implementation (see parseUrl below for the same constraint).
export function buildWebLink({
  recipient,
  label,
  amount,
}: Omit<PayFields, 'mint'>): string {
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

// Which payload the QR carries. Solana Pay locks the token so the sender
// cannot pick the wrong one, but only some wallets implement the spec
// (Solflare and Phantom do; SafePal, Jupiter and others do not scan it at
// all, or drop the spl-token field and default to SOL). 'universal' trades
// the lock away for a bare address, which every Solana wallet can scan.
export type QrMode = 'solanapay' | 'universal';

export const QR_MODES: Record<
  QrMode,
  {tab: string; blurb: string; locked: boolean}
> = {
  solanapay: {
    tab: 'Solana Pay',
    blurb: 'Locked to PIPRO. Solflare & Phantom.',
    locked: true,
  },
  universal: {
    tab: 'Universal',
    blurb: 'Any wallet. Sender picks PIPRO.',
    locked: false,
  },
};

// A universal QR is the bare recipient address and nothing else: a wallet that
// does not understand Solana Pay still reads it as "send to this address".
// The token and amount ride on the printed card instead of in the QR, so the
// card MUST keep showing them.
export function buildQrValue(mode: QrMode, fields: PayFields): string {
  if (!isBase58Address(fields.recipient)) {
    throw new Error('Invalid wallet address');
  }
  return mode === 'universal' ? fields.recipient : buildUrl(fields);
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
  // A bare address from a 'universal' QR. The token is NOT pinned by the code,
  // so this can never be reported with the same confidence as a 'valid' card.
  | {status: 'address'; fields: PayFields}
  | {status: 'wrong-token'; mint: string}
  | {status: 'invalid'};

export function checkCard(raw: string): CardCheck {
  const fields = parseUrl(raw);
  if (!fields) {
    const bare = raw.trim();
    if (isBase58Address(bare)) {
      return {
        status: 'address',
        fields: {recipient: bare, mint: PIPRO_MINT, label: ''},
      };
    }
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

// --- PIPRO transfer history --------------------------------------------------
// Direction and amount come from the wallet's own pre/post token balances, not
// from parsed instructions: a transfer can be split across several instructions
// or several token accounts, and only the net balance change is reliable.
export interface TokenTransfer {
  signature: string;
  delta: number; // signed, in UI units — positive is received
  balanceAfter: number; // owner's PIPRO balance immediately after this tx
  blockTime: number | null;
}

interface SigInfo {
  signature: string;
  err?: unknown;
  blockTime?: number | null;
}

// signatures must be newest-first (as getSignaturesForAddress returns them) and
// txResults must be aligned with it index-for-index.
export function buildTxHistory(
  signatures: SigInfo[],
  txResults: any[],
  owner: string,
  mint: string,
  decimals: number,
  currentBalance: number,
): TokenTransfer[] {
  const held = (list: any[]): number =>
    (list || [])
      .filter((b: any) => b.owner === owner && b.mint === mint)
      .reduce((sum: number, b: any) => sum + Number(b.uiTokenAmount?.uiAmount || 0), 0);

  const dust = Math.pow(10, -decimals) / 2;
  const history: TokenTransfer[] = [];
  let running = currentBalance;

  signatures.forEach((sig, i) => {
    const tx = txResults[i];
    if (sig.err || !tx || !tx.meta) {
      return;
    }
    const delta = held(tx.meta.postTokenBalances) - held(tx.meta.preTokenBalances);
    if (Math.abs(delta) < dust) {
      return; // fee-only or unrelated transaction
    }
    history.push({
      signature: sig.signature,
      delta,
      balanceAfter: running,
      blockTime: tx.blockTime ?? sig.blockTime ?? null,
    });
    running -= delta; // undo it to reach the balance before this tx
  });

  return history;
}

// --- history filtering -------------------------------------------------------
export type TxFilter = 'all' | 'in' | 'out';

// 'YYYY-MM-DD' -> unix seconds, or null when the box is empty, half-typed or
// not a real calendar date. Null means "no limit", so a partially typed date
// never silently hides every row.
export function parseDateInput(
  value: string,
  endOfDay: boolean = false,
): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) {
    return null;
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = endOfDay
    ? new Date(y, mo - 1, d, 23, 59, 59)
    : new Date(y, mo - 1, d, 0, 0, 0);
  // Rejects overflow dates like 2024-02-31, which Date would roll into March.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return Math.floor(date.getTime() / 1000);
}

// Direction and date are applied together. A transfer with no blockTime can be
// shown but never date-matched, so it drops out as soon as a bound is set --
// better than asserting it falls inside a range we cannot check.
export function filterTransfers<
  T extends {delta: number; blockTime: number | null},
>(list: T[], direction: TxFilter, from: string, to: string): T[] {
  const after = parseDateInput(from);
  const before = parseDateInput(to, true);

  return list.filter(item => {
    if (direction === 'in' && item.delta <= 0) {
      return false;
    }
    if (direction === 'out' && item.delta >= 0) {
      return false;
    }
    if (after === null && before === null) {
      return true;
    }
    if (item.blockTime === null) {
      return false;
    }
    if (after !== null && item.blockTime < after) {
      return false;
    }
    if (before !== null && item.blockTime > before) {
      return false;
    }
    return true;
  });
}
