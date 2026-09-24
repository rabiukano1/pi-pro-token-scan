import React, {useRef, useState} from 'react';
import {
  Alert,
  Clipboard,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import {
  ASSOCIATION,
  buildQrValue,
  buildWebLink,
  isBase58Address,
  MOTTO,
  PIPRO_MINT,
  QR_MODES,
  QR_TYPES,
  QrMode,
  QrType,
} from './solanaPay';
import AdBanner from './components/AdBanner';
import {C, GOLD} from './theme';
import {useInterstitialAd} from './hooks/useInterstitialAd';

const logo = require('./assets/pipro-logo.png');

interface Props {
  initialWallet?: string;
  initialName?: string;
  initialAmount?: string;
}

export default function GenerateScreen({
  initialWallet,
  initialName,
  initialAmount,
}: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [wallet, setWallet] = useState(initialWallet ?? '');
  const [amount, setAmount] = useState(initialAmount ?? '');
  const [qrType, setQrType] = useState<QrType>('marchant');
  const [qrMode, setQrMode] = useState<QrMode>('solanapay');
  const [url, setUrl] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const type = QR_TYPES[qrType];
  const mode = QR_MODES[qrMode];
  const {showInterstitialIfAvailable, isLoaded} = useInterstitialAd();

  // Switching type clears the card so the badge on screen always matches the
  // selected type — a member must never see a marchant badge.
  const pickType = (t: QrType) => {
    setQrType(t);
    setUrl(null);
  };

  // The card prints different wording per mode, so a stale card must not
  // survive the switch — it would claim a token lock the QR no longer carries.
  const pickMode = (m: QrMode) => {
    setQrMode(m);
    setUrl(null);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        setWallet(text.trim());
        setBalance(null);
      }
    } catch {
      // ignore clipboard read failure
    }
  };

  const checkBalance = async () => {
    if (!isBase58Address(wallet.trim())) {
      Alert.alert('Invalid wallet address');
      return;
    }
    setIsCheckingBalance(true);
    setBalance(null);
    try {
      const response = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            wallet.trim(),
            {mint: PIPRO_MINT},
            {encoding: 'jsonParsed'},
          ],
        }),
      });
      const data = await response.json();
      if (data.error) {
        Alert.alert('Error', data.error.message || 'Failed to fetch balance');
      } else {
        const accounts = data.result.value;
        if (!accounts || accounts.length === 0) {
          setBalance('0');
        } else {
          let total = 0;
          let decimals = 0;
          for (const acc of accounts) {
            const tokenAmount = acc.account.data.parsed.info.tokenAmount;
            total += Number(tokenAmount.amount);
            decimals = tokenAmount.decimals;
          }
          const formatted = (total / Math.pow(10, decimals)).toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
          });
          setBalance(formatted);
        }
      }
    } catch {
      Alert.alert('Error', 'Network error while checking balance');
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const generate = () => {
    setUrl(
      buildQrValue(qrMode, {
        recipient: wallet.trim(),
        mint: PIPRO_MINT,
        label: name,
        amount: amount.trim() || undefined,
      }),
    );
  };

  const handleGeneratePress = () => {
    if (!isBase58Address(wallet.trim())) {
      Alert.alert('Invalid wallet address');
      return;
    }
    if (amount.trim() && !/^\d+(\.\d+)?$/.test(amount.trim())) {
      Alert.alert('Amount must be a number');
      return;
    }
    
    // Generate QR immediately
    generate();

    // Show Interstitial ad
    console.log('GenerateScreen: Generate pressed. Interstitial isLoaded =', isLoaded);
    showInterstitialIfAvailable();
  };

  const shareImage = async () => {
    try {
      const path = await shotRef.current?.capture?.();
      if (path) {
        await Share.open({url: 'file://' + path, type: 'image/png'});
      }
    } catch {
      // user closed the share sheet — nothing to do
    }
  };

  const shareLink = async () => {
    try {
      // A real https:// link, not the raw "solana:" text — WhatsApp/Telegram
      // don't auto-link custom schemes, so the old raw link just sat there
      // as dead text. This page is tappable and hands off to any wallet.
      await Share.open({
        message: buildWebLink({recipient: wallet.trim(), label: name, amount}),
      });
    } catch {}
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.sectionLabel}>CARD TYPE</Text>
      <View style={styles.segment}>
        {(['marchant', 'member'] as QrType[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.segmentBtn, qrType === t && styles.segmentBtnOn]}
            onPress={() => pickType(t)}
          >
            <Text
              style={[
                styles.segmentText,
                qrType === t && styles.segmentTextOn,
              ]}
            >
              {QR_TYPES[t].tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>WALLET COMPATIBILITY</Text>
      <View style={styles.segment}>
        {(['solanapay', 'universal'] as QrMode[]).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.segmentBtn, qrMode === m && styles.segmentBtnOn]}
            onPress={() => pickMode(m)}
          >
            <Text
              style={[
                styles.segmentText,
                qrMode === m && styles.segmentTextOn,
              ]}
            >
              {QR_MODES[m].tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.blurb}>{mode.blurb}</Text>

      <Text style={styles.sectionLabel}>{type.nameLabel.toUpperCase()}</Text>
      <View
        style={[
          styles.inputShell,
          focused === 'name' && styles.inputShellFocused,
        ]}
      >
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. Aminu"
          placeholderTextColor={C.dim}
        />
      </View>

      <View style={styles.labelRow}>
        <Text style={styles.sectionLabelFlush}>WALLET ADDRESS</Text>
        {wallet.trim().length > 0 && (
          <TouchableOpacity
            style={styles.miniBtn}
            onPress={checkBalance}
            disabled={isCheckingBalance}
          >
            <Text style={styles.miniBtnText}>
              {isCheckingBalance ? 'Checking…' : 'Check balance'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View
        style={[
          styles.inputShell,
          focused === 'wallet' && styles.inputShellFocused,
        ]}
      >
        <TextInput
          style={styles.input}
          value={wallet}
          onChangeText={text => {
            setWallet(text);
            setBalance(null);
          }}
          onFocus={() => setFocused('wallet')}
          onBlur={() => setFocused(null)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Receiver wallet address"
          placeholderTextColor={C.dim}
        />
        {wallet.length > 0 ? (
          <TouchableOpacity
            style={styles.inputAction}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            onPress={() => {
              setWallet('');
              setBalance(null);
            }}
          >
            <Text style={styles.inputActionClear}>✕</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.inputAction, styles.pasteBtn]}
            onPress={pasteFromClipboard}
          >
            <Text style={styles.pasteBtnText}>Paste</Text>
          </TouchableOpacity>
        )}
      </View>
      {balance !== null && (
        <View style={styles.balancePill}>
          <View style={styles.dotGreen} />
          <Text style={styles.balancePillText}>{balance} PIPRO</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>AMOUNT (OPTIONAL)</Text>
      <View
        style={[
          styles.inputShell,
          focused === 'amount' && styles.inputShellFocused,
        ]}
      >
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          onFocus={() => setFocused('amount')}
          onBlur={() => setFocused(null)}
          keyboardType="decimal-pad"
          placeholder="Leave empty to let sender choose"
          placeholderTextColor={C.dim}
        />
      </View>

      <Text style={styles.sectionLabel}>PIPRO TOKEN CONTRACT</Text>
      <View style={styles.mintRow}>
        <Text
          style={styles.mintValue}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {PIPRO_MINT}
        </Text>
        <View style={mode.locked ? styles.lockChip : styles.warnChip}>
          <Text style={mode.locked ? styles.lockChipText : styles.warnChipText}>
            {mode.locked ? 'LOCKED' : 'SENDER PICKS'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={handleGeneratePress}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Generate QR</Text>
      </TouchableOpacity>

      {url && (
        <View style={styles.result}>
          <ViewShot
            ref={shotRef}
            options={{format: 'png', quality: 1}}
            style={styles.qrCard}
          >
            <View style={styles.cardHeader}>
              <Image source={logo} style={styles.cardLogo} />
              <Text style={styles.cardBrand}>PIPRO</Text>
            </View>
            {/* Kept to one line each: a broken association name reads as fake. */}
            <Text style={styles.assoc} numberOfLines={1} adjustsFontSizeToFit>
              {ASSOCIATION}
            </Text>
            <Text style={styles.motto} numberOfLines={1} adjustsFontSizeToFit>
              {MOTTO}
            </Text>

            <View style={styles.qrBox}>
              <QRCode
                value={url}
                size={230}
                ecl="H"
                logo={logo}
                logoSize={46}
                logoBackgroundColor="#fff"
                logoBorderRadius={23}
              />
            </View>

            {!mode.locked && (
              <View style={styles.manualBox}>
                <Text style={styles.manualTitle}>SEND THIS TOKEN ONLY</Text>
                <Text style={styles.manualToken}>PIPRO</Text>
                <Text style={styles.manualMint}>{PIPRO_MINT}</Text>
                {!!amount.trim() && (
                  <Text style={styles.manualAmount}>
                    Amount: {amount.trim()} PIPRO
                  </Text>
                )}
              </View>
            )}

            {!!name.trim() && <Text style={styles.owner}>{name.trim()}</Text>}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{type.badge}</Text>
            </View>
            <Text style={styles.cardMessage}>
              {mode.locked
                ? type.note
                : 'Scan with any Solana wallet, then choose PIPRO above and ' +
                  'send. Check the token matches before confirming.'}
            </Text>
          </ViewShot>

          <TouchableOpacity style={styles.primaryBtn} onPress={shareImage}>
            <Text style={styles.primaryBtnText}>Share QR image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={shareLink}>
            <Text style={styles.secondaryBtnText}>Share link</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.bannerWrapper}>
        <AdBanner />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: C.bg},
  container: {padding: 18, paddingBottom: 36},
  bannerWrapper: {alignItems: 'center', marginTop: 26, marginBottom: 12},

  dotGreen: {width: 6, height: 6, borderRadius: 3, backgroundColor: C.green},

  sectionLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 20,
    marginBottom: 9,
  },
  sectionLabelFlush: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 9,
  },
  blurb: {
    color: C.dim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: 5,
    gap: 5,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnOn: {backgroundColor: GOLD},
  segmentText: {color: C.muted, fontSize: 13, fontWeight: '700'},
  segmentTextOn: {color: C.bg, fontWeight: '800'},

  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingLeft: 16,
    paddingRight: 8,
  },
  inputShellFocused: {borderColor: GOLD},
  input: {flex: 1, color: C.text, fontSize: 14, paddingVertical: 15},
  inputAction: {paddingHorizontal: 10, paddingVertical: 8},
  inputActionClear: {color: C.muted, fontSize: 15, fontWeight: '700'},
  pasteBtn: {
    backgroundColor: C.raised,
    borderRadius: 10,
    paddingHorizontal: 13,
  },
  pasteBtnText: {color: GOLD, fontSize: 12, fontWeight: '800'},

  miniBtn: {
    backgroundColor: C.raised,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  miniBtnText: {color: GOLD, fontSize: 11, fontWeight: '800'},

  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    marginTop: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  balancePillText: {color: C.green, fontSize: 12, fontWeight: '800'},

  mintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mintValue: {
    flex: 1,
    color: C.muted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  lockChip: {
    backgroundColor: C.raised,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockChipText: {color: C.muted, fontSize: 9, fontWeight: '800'},
  warnChip: {
    backgroundColor: '#3a2a12',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  warnChipText: {color: '#f0a03c', fontSize: 9, fontWeight: '800'},

  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 22,
  },
  primaryBtnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: C.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {color: GOLD, fontSize: 13, fontWeight: '800'},

  result: {marginTop: 22},
  qrCard: {
    backgroundColor: C.bg,
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  cardHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  cardLogo: {width: 30, height: 30, borderRadius: 15},
  cardBrand: {
    color: GOLD,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 3,
  },
  assoc: {
    color: C.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 3,
  },
  motto: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 16,
  },
  qrBox: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 18,
  },
  owner: {
    marginTop: 16,
    fontSize: 19,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 0.3,
  },
  badge: {
    marginTop: 10,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  badgeText: {color: C.bg, fontSize: 12, fontWeight: '800'},
  cardMessage: {
    marginTop: 13,
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },

  manualBox: {
    marginTop: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  manualTitle: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  manualToken: {
    color: C.text,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 3,
  },
  manualMint: {
    color: C.muted,
    fontSize: 8.5,
    marginTop: 4,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  manualAmount: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
});
