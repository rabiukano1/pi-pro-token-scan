import {
  ASSOCIATION,
  buildUrl,
  MOTTO,
  parseUrl,
  parseDeepLink,
  PIPRO_MINT,
  QR_TYPES,
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
