import React, {useRef, useState} from 'react';
import {
  Alert,
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
  buildUrl,
  buildWebLink,
  isBase58Address,
  MOTTO,
  PIPRO_MINT,
  QR_TYPES,
  QrType,
} from './solanaPay';
import AdBanner from './components/AdBanner';

const logo = require('./assets/pipro-logo.png');
const GOLD = '#d4a437';

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
  const [url, setUrl] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const type = QR_TYPES[qrType];

  // Switching type clears the card so the badge on screen always matches the
  // selected type — a member must never see a marchant badge.
  const pickType = (t: QrType) => {
    setQrType(t);
    setUrl(null);
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
    } catch (err) {
      Alert.alert('Error', 'Network error while checking balance');
    } finally {
      setIsCheckingBalance(false);
    }
  };

  const generate = () => {
    if (!isBase58Address(wallet.trim())) {
      Alert.alert('Invalid wallet address');
      return;
    }
    if (amount.trim() && !/^\d+(\.\d+)?$/.test(amount.trim())) {
      Alert.alert('Amount must be a number');
      return;
    }
    setUrl(
      buildUrl({
        recipient: wallet.trim(),
        mint: PIPRO_MINT,
        label: name,
        amount: amount.trim() || undefined,
      }),
    );
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.hint}>
        Create a verified payment QR for your customers
      </Text>
      <Text style={styles.label}>QR type</Text>
      <View style={styles.seg}>
        {(['marchant', 'member'] as QrType[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.segBtn, qrType === t && styles.segBtnOn]}
            onPress={() => pickType(t)}>
            <Text style={[styles.segText, qrType === t && styles.segTextOn]}>
              {QR_TYPES[t].tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{type.nameLabel}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Aminu"
        placeholderTextColor="#6c6285"
      />
      <View style={styles.labelRow}>
        <Text style={styles.labelRowText}>Your wallet address</Text>
        {wallet.trim().length > 0 && (
          <TouchableOpacity onPress={checkBalance} disabled={isCheckingBalance}>
            <Text style={styles.checkBalanceText}>
              {isCheckingBalance ? 'Checking...' : 'Check Balance'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <TextInput
        style={styles.input}
        value={wallet}
        onChangeText={text => {
          setWallet(text);
          setBalance(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Receiver wallet address"
        placeholderTextColor="#6c6285"
      />
      {balance !== null && (
        <Text style={styles.balanceDisplay}>Balance: {balance} PIPRO</Text>
      )}
      <Text style={styles.label}>Amount (optional)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Leave empty to let sender choose"
        placeholderTextColor="#6c6285"
      />
      <Text style={styles.label}>PIPRO token contract (mint)</Text>
      <View style={styles.lockedField}>
        <Text style={styles.lockedText} numberOfLines={1} ellipsizeMode="middle">
          {PIPRO_MINT}
        </Text>
        <Text style={styles.lockedBadge}>🔒 Locked</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={generate}>
        <Text style={styles.buttonText}>Generate QR</Text>
      </TouchableOpacity>

      {url && (
        <View style={styles.result}>
          <ViewShot
            ref={shotRef}
            options={{format: 'png', quality: 1}}
            style={styles.qrCard}>
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
            {!!name.trim() && <Text style={styles.owner}>{name.trim()}</Text>}
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{type.badge}</Text>
            </View>
            <Text style={styles.cardMessage}>{type.note}</Text>
          </ViewShot>
          <TouchableOpacity style={styles.button} onPress={shareImage}>
            <Text style={styles.buttonText}>Share QR image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonAlt} onPress={shareLink}>
            <Text style={styles.buttonAltText}>Share link</Text>
          </TouchableOpacity>
        </View>
      )}
      <AdBanner />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {backgroundColor: '#0d0b14'},
  container: {padding: 20, paddingBottom: 40},
  hint: {
    color: '#9a8db5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  labelRowText: {
    fontSize: 13,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 0.5,
  },
  checkBalanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b5aacd',
  },
  balanceDisplay: {
    color: '#4ade80',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
    color: GOLD,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#2c2440',
    backgroundColor: '#161226',
    color: '#fff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  button: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonAlt: {
    borderColor: GOLD,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {color: '#0d0b14', fontWeight: '800', fontSize: 15},
  buttonAltText: {color: GOLD, fontWeight: '700', fontSize: 15},
  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: '#161226',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  lockedText: {flex: 1, color: GOLD, fontSize: 13, fontWeight: '600'},
  lockedBadge: {color: '#9a8db5', fontSize: 11, fontWeight: '700', marginLeft: 8},
  result: {alignItems: 'stretch', marginTop: 20},
  qrCard: {
    backgroundColor: '#0d0b14',
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  seg: {
    flexDirection: 'row',
    backgroundColor: '#161226',
    borderWidth: 1.5,
    borderColor: '#2c2440',
    borderRadius: 14,
    padding: 5,
  },
  segBtn: {flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center'},
  segBtnOn: {backgroundColor: GOLD},
  segText: {color: '#9a8db5', fontSize: 14, fontWeight: '700'},
  segTextOn: {color: '#0d0b14'},
  cardHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  assoc: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 3,
  },
  motto: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 16,
  },
  cardLogo: {width: 36, height: 36, borderRadius: 18, marginRight: 10},
  cardBrand: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
  },
  qrBox: {backgroundColor: '#fff', borderRadius: 16, padding: 14},
  owner: {marginTop: 14, fontSize: 18, fontWeight: '800', color: '#fff'},
  badge: {
    marginTop: 10,
    backgroundColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgeText: {color: '#0d0b14', fontSize: 12, fontWeight: '800'},
  cardMessage: {
    marginTop: 12,
    color: '#b5aacd',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
