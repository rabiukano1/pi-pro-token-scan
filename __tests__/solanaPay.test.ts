import {
  ASSOCIATION,
  buildQrValue,
  filterTransfers,
  parseDateInput,
  buildTxHistory,
  buildUrl,
  buildWebLink,
  checkCard,
  MOTTO,
  parseUrl,
  parseDeepLink,
  PAY_BASE_URL,
  PIPRO_MINT,
  QR_TYPES,
} from '../src/solanaPay';
import {toISODate} from '../src/theme';

const WALLET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('buildUrl', () => {
  it('builds a transfer URL with the locked mint', () => {
    const url = buildUrl({recipient: WALLET, mint: PIPRO_MINT, label: 'Aminu'});
    expect(url).toBe(
      `solana:${WALLET}?spl-token=${PIPRO_MINT}&label=Aminu`,
    );
  });

  it('includes amount when given', () => {
    const url = buildUrl({
      recipient: WALLET,
      mint: PIPRO_MINT,
      label: 'Aminu',
      amount: '12.5',
    });
    expect(url).toContain('&amount=12.5');
  });

  it('rejects a bad wallet', () => {
    expect(() =>
      buildUrl({recipient: 'not-a-wallet', mint: PIPRO_MINT, label: ''}),
    ).toThrow();
  });

  it('round-trips through parseUrl', () => {
    const url = buildUrl({recipient: WALLET, mint: PIPRO_MINT, label: 'Aminu'});
    expect(parseUrl(url)).toEqual({
      recipient: WALLET,
      mint: PIPRO_MINT,
      label: 'Aminu',
    });
  });
});

describe('parseUrl rejects non-transfer QRs', () => {
  it.each([
    'https://evil.example.com',
    'solana:',
    `solana:${WALLET}?spl-token=fake`,
    'javascript:alert(1)',
  ])('rejects %s', raw => {
    expect(parseUrl(raw)).toBeNull();
  });
});

describe('buildWebLink', () => {
  it('builds an https link, not a raw solana: link', () => {
    const link = buildWebLink({recipient: WALLET, label: 'Aminu'});
    expect(link.startsWith('https://')).toBe(true);
    expect(link).toContain(`to=${WALLET}`);
    expect(link).toContain('label=Aminu');
  });

  it('never accepts a mint — the page always uses the locked PIPRO mint', () => {
    // Mint is not a param on PayFields minus mint, so this is really a
    // compile-time guarantee; this test documents the URL has no mint field.
    const link = buildWebLink({recipient: WALLET, label: ''});
    expect(link).not.toMatch(/mint=|spl-token=/);
  });

  it('omits amount and label when absent, includes them when present', () => {
    expect(buildWebLink({recipient: WALLET, label: ''})).not.toContain('amount=');
    expect(buildWebLink({recipient: WALLET, label: '', amount: '12.5'}))
      .toContain('amount=12.5');
  });

  it('percent-encodes a label with spaces and special characters', () => {
    const link = buildWebLink({recipient: WALLET, label: 'Sauki & Sons'});
    expect(link).toContain('label=Sauki%20%26%20Sons');
  });

  it('rejects an invalid wallet rather than building a broken link', () => {
    expect(() => buildWebLink({recipient: 'not-a-wallet', label: ''})).toThrow();
  });

  it('points at the real deployed pay page', () => {
    expect(PAY_BASE_URL).toBe('https://rabiukano1.github.io/pi-pro-token-scan/p.html');
  });
});

describe('checkCard — fake card detection', () => {
  const OTHER_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

  it('accepts a genuine PIPRO card', () => {
    const url = buildUrl({recipient: WALLET, mint: PIPRO_MINT, label: 'Aminu'});
    const r = checkCard(url);
    expect(r.status).toBe('valid');
    if (r.status === 'valid') {
      expect(r.fields.mint).toBe(PIPRO_MINT);
      expect(r.fields.label).toBe('Aminu');
    }
  });

  it('REJECTS a well-formed QR for a different token', () => {
    // The core attack: a real Solana Pay QR that moves the wrong token.
    const fake = `solana:${WALLET}?spl-token=${OTHER_MINT}&label=Aminu`;
    const r = checkCard(fake);
    expect(r.status).toBe('wrong-token');
    if (r.status === 'wrong-token') {
      expect(r.mint).toBe(OTHER_MINT);
    }
  });

  it('rejects a plain SOL request with no token at all', () => {
    expect(checkCard(`solana:${WALLET}?amount=5`).status).toBe('invalid');
  });

  it.each([
    'https://evil.example.com',
    'javascript:alert(1)',
    'solana:',
    'not a qr at all',
  ])('rejects %s', raw => {
    expect(checkCard(raw).status).toBe('invalid');
  });

  it('distinguishes a fake card from an unreadable one', () => {
    // These must not collapse into the same message: one is a scam, the
    // other is a bad scan.
    expect(checkCard(`solana:${WALLET}?spl-token=${OTHER_MINT}`).status)
      .toBe('wrong-token');
    expect(checkCard('random-text').status).toBe('invalid');
  });
});

describe('card wording', () => {
  it('never labels a member as a marchant', () => {
    const text = [
      QR_TYPES.member.badge,
      QR_TYPES.member.nameLabel,
      QR_TYPES.member.note,
      QR_TYPES.member.tab,
    ].join(' ');
    expect(text).not.toMatch(/m[ae]rchant/i);
  });

  it('keeps the authorization claim on the marchant card', () => {
    expect(QR_TYPES.marchant.badge).toMatch(/Authorized Marchant/);
  });

  it('uses the community "Marchant" spelling everywhere', () => {
    const all = JSON.stringify(QR_TYPES);
    expect(all).not.toMatch(/Merchant/);
  });

  it('carries the association identity', () => {
    expect(ASSOCIATION).toBe('PI PRO AREWA ASSOCIATION');
    expect(MOTTO).toBe('MOTTO: BAHAUSE BA WASABA');
  });

  it('pays out identically regardless of card type', () => {
    // The type affects wording only; buildUrl takes no type argument at all.
    const url = buildUrl({recipient: WALLET, mint: PIPRO_MINT, label: 'x'});
    expect(url).not.toMatch(/marchant|member/i);
  });
});

describe('parseDeepLink', () => {
  it('parses a generate link with params', () => {
    expect(
      parseDeepLink(`pipro://generate?wallet=${WALLET}&name=Aminu&amount=5`),
    ).toEqual({screen: 'generate', wallet: WALLET, name: 'Aminu', amount: '5'});
  });

  it('parses a bare scan link', () => {
    expect(parseDeepLink('pipro://scan')).toEqual({
      screen: 'scan',
      wallet: undefined,
      name: undefined,
      amount: undefined,
    });
  });

  it('drops an invalid wallet instead of trusting it', () => {
    const link = parseDeepLink('pipro://generate?wallet=hacker');
    expect(link?.wallet).toBeUndefined();
  });

  it('drops a non-numeric amount', () => {
    const link = parseDeepLink(`pipro://generate?wallet=${WALLET}&amount=1e9;DROP`);
    expect(link?.amount).toBeUndefined();
  });

  it('ignores links that are not ours', () => {
    expect(parseDeepLink('https://example.com')).toBeNull();
    expect(parseDeepLink('pipro://transfer')).toBeNull();
  });
});

describe('buildTxHistory', () => {
  const OWNER = 'ownerWallet';
  const MINT = 'piproMint';

  const bal = (owner: string, amount: number, mint = MINT) => ({
    owner,
    mint,
    uiTokenAmount: {uiAmount: amount},
  });

  const tx = (pre: any[], post: any[], blockTime: number | null = 1700000000) => ({
    blockTime,
    meta: {preTokenBalances: pre, postTokenBalances: post},
  });

  const sigs = (...names: string[]) =>
    names.map(signature => ({signature, blockTime: 1700000000}));

  it('labels direction and reconstructs the balance before each tx', () => {
    // newest-first: received 30, before that sent 10, before that received 100
    const history = buildTxHistory(
      sigs('c', 'b', 'a'),
      [
        tx([bal(OWNER, 90)], [bal(OWNER, 120)]),
        tx([bal(OWNER, 100)], [bal(OWNER, 90)]),
        tx([], [bal(OWNER, 100)]),
      ],
      OWNER,
      MINT,
      2,
      120, // current balance
    );

    expect(history.map(h => [h.signature, h.delta, h.balanceAfter])).toEqual([
      ['c', 30, 120],
      ['b', -10, 90],
      ['a', 100, 100],
    ]);
    // balance before the newest deposit
    expect(history[0].balanceAfter - history[0].delta).toBe(90);
  });

  it('ignores other wallets, other mints, failed and fee-only transactions', () => {
    const history = buildTxHistory(
      [
        {signature: 'failed', err: {InstructionError: []}, blockTime: 1},
        ...sigs('someoneElse', 'wrongMint', 'feeOnly', 'noMeta'),
      ],
      [
        tx([bal(OWNER, 0)], [bal(OWNER, 500)]), // would count, but errored
        tx([bal('otherWallet', 0)], [bal('otherWallet', 5)]),
        tx([bal(OWNER, 0, 'usdcMint')], [bal(OWNER, 5, 'usdcMint')]),
        tx([bal(OWNER, 7)], [bal(OWNER, 7)]),
        {blockTime: 1, meta: null},
      ],
      OWNER,
      MINT,
      2,
      7,
    );

    expect(history).toEqual([]);
  });

  it('sums across multiple token accounts owned by the same wallet', () => {
    const history = buildTxHistory(
      sigs('split'),
      [tx([bal(OWNER, 1), bal(OWNER, 2)], [bal(OWNER, 5), bal(OWNER, 8)])],
      OWNER,
      MINT,
      2,
      13,
    );

    expect(history[0].delta).toBe(10);
  });

  it('treats sub-decimal float noise as no movement', () => {
    const history = buildTxHistory(
      sigs('dust'),
      [tx([bal(OWNER, 0.1 + 0.2)], [bal(OWNER, 0.3)])],
      OWNER,
      MINT,
      2,
      0.3,
    );

    expect(history).toEqual([]);
  });
});

describe('buildQrValue', () => {
  const fields = {
    recipient: WALLET,
    mint: PIPRO_MINT,
    label: 'Aminu',
    amount: '25',
  };

  it('pins the mint in solanapay mode', () => {
    const v = buildQrValue('solanapay', fields);
    expect(v.startsWith('solana:' + WALLET)).toBe(true);
    expect(v).toContain('spl-token=' + PIPRO_MINT);
    expect(v).toContain('amount=25');
  });

  it('emits a naked address in universal mode, which is what scanners want', () => {
    // No solana: prefix: SafePal's scanner does not parse it and drops to
    // offering the raw text as a copy. The chain is named on the card instead.
    expect(buildQrValue('universal', fields)).toBe(WALLET);
    expect(buildQrValue('universal', fields)).not.toContain('spl-token');
  });

  it('still reads the prefixed form printed by the one release that used it', () => {
    const prefixed = checkCard('solana:' + WALLET);
    expect(prefixed.status).toBe('address');
    if (prefixed.status === 'address') {
      expect(prefixed.fields.recipient).toBe(WALLET);
    }
  });

  it('rejects a bad address in either mode', () => {
    const bad = {...fields, recipient: 'not-an-address'};
    expect(() => buildQrValue('solanapay', bad)).toThrow();
    expect(() => buildQrValue('universal', bad)).toThrow();
  });

  it('round-trips through checkCard in both modes', () => {
    expect(checkCard(buildQrValue('solanapay', fields)).status).toBe('valid');

    const bare = checkCard(buildQrValue('universal', fields));
    // Never 'valid': a bare address carries no proof of which token is sent.
    expect(bare.status).toBe('address');
    if (bare.status === 'address') {
      expect(bare.fields.recipient).toBe(WALLET);
    }
  });

  it('still rejects a wrong-token QR once bare addresses are accepted', () => {
    const fake = buildUrl({...fields, mint: 'So11111111111111111111111111111111111111112'});
    expect(checkCard(fake).status).toBe('wrong-token');
    expect(checkCard('https://evil.example.com/' + WALLET).status).toBe('invalid');
    expect(checkCard('').status).toBe('invalid');
  });
});

describe('parseDateInput', () => {
  it('reads a full date as local midnight', () => {
    const t = parseDateInput('2024-03-05');
    expect(new Date(t! * 1000).getDate()).toBe(5);
    expect(new Date(t! * 1000).getHours()).toBe(0);
  });

  it('ends the day at 23:59:59 so the "to" date is inclusive', () => {
    const t = parseDateInput('2024-03-05', true);
    expect(new Date(t! * 1000).getHours()).toBe(23);
  });

  it('treats empty, half-typed and impossible dates as no limit', () => {
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('2024-03')).toBeNull();
    expect(parseDateInput('2024-3-5')).toBeNull();
    expect(parseDateInput('2024-02-31')).toBeNull(); // would roll into March
    expect(parseDateInput('2024-13-01')).toBeNull();
  });
});

describe('filterTransfers', () => {
  const at = (iso: string) => Math.floor(new Date(iso + 'T12:00:00').getTime() / 1000);
  const rows = [
    {delta: 30, blockTime: at('2024-03-10')},
    {delta: -10, blockTime: at('2024-03-05')},
    {delta: 100, blockTime: at('2024-02-01')},
    {delta: -5, blockTime: null},
  ];

  it('splits received from sent', () => {
    expect(filterTransfers(rows, 'in', '', '').map(r => r.delta)).toEqual([30, 100]);
    expect(filterTransfers(rows, 'out', '', '').map(r => r.delta)).toEqual([-10, -5]);
    expect(filterTransfers(rows, 'all', '', '')).toHaveLength(4);
  });

  it('bounds by date inclusively on both ends', () => {
    expect(
      filterTransfers(rows, 'all', '2024-03-05', '2024-03-10').map(r => r.delta),
    ).toEqual([30, -10]);
    // same day both ends still returns that day
    expect(
      filterTransfers(rows, 'all', '2024-03-05', '2024-03-05').map(r => r.delta),
    ).toEqual([-10]);
  });

  it('combines direction and date', () => {
    expect(
      filterTransfers(rows, 'in', '2024-03-01', '').map(r => r.delta),
    ).toEqual([30]);
  });

  it('ignores a half-typed date instead of hiding everything', () => {
    expect(filterTransfers(rows, 'all', '2024-0', '')).toHaveLength(4);
  });

  it('drops an undated transfer only once a bound is set', () => {
    expect(filterTransfers(rows, 'out', '', '').map(r => r.delta)).toContain(-5);
    expect(filterTransfers(rows, 'out', '2024-01-01', '').map(r => r.delta)).toEqual([-10]);
  });
});

describe('toISODate', () => {
  it('uses the local calendar day, not UTC', () => {
    // Late-evening local time is already the next day in UTC, so toISOString
    // would report tomorrow for anyone behind it.
    const d = new Date(2024, 2, 5, 23, 30, 0);
    expect(toISODate(d)).toBe('2024-03-05');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toISODate(new Date(2024, 0, 9))).toBe('2024-01-09');
  });

  it('round-trips through the filter as a single-day range', () => {
    const day = toISODate(new Date(2024, 2, 5));
    const rows = [
      {delta: 5, blockTime: Math.floor(new Date(2024, 2, 5, 9, 0).getTime() / 1000)},
      {delta: 7, blockTime: Math.floor(new Date(2024, 2, 6, 9, 0).getTime() / 1000)},
    ];
    // This is exactly what the Today button does: from and to set to one date.
    expect(filterTransfers(rows, 'all', day, day).map(r => r.delta)).toEqual([5]);
  });
});
