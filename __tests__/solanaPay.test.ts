import {
  ASSOCIATION,
  buildUrl,
  buildWebLink,
  checkCard,
  MOTTO,
  parseUrl,
  parseDeepLink,
  PAY_BASE_URL,
  PIPRO_MINT,
  QR_TYPES,
  TEST_MINT,
} from '../src/solanaPay';

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
    expect(PAY_BASE_URL).toBe('https://rabiukano1.github.io/pi-pro-token-scan/pay.html');
  });

  it('omits test=1 by default', () => {
    expect(buildWebLink({recipient: WALLET, label: ''})).not.toContain('test=');
  });

  it('adds test=1 when test cards are being shared', () => {
    expect(buildWebLink({recipient: WALLET, label: '', test: true}))
      .toContain('test=1');
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

  it('flags the devnet test token as test, never as verified PIPRO', () => {
    if (!TEST_MINT) {
      return; // test mint removed for production — nothing to check
    }
    const url = `solana:${WALLET}?spl-token=${TEST_MINT}&label=Tester`;
    const r = checkCard(url);
    expect(r.status).toBe('test-token');
    expect(r.status).not.toBe('valid');
  });

  it('never lets the test token masquerade as the real mint', () => {
    expect(TEST_MINT).not.toBe(PIPRO_MINT);
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
