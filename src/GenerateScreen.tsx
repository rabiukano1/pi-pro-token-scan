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
import Clipboard from '@react-native-clipboard/clipboard';
import {
  ASSOCIATION,
  buildUrl,
  buildWebLink,
  isBase58Address,
  MOTTO,
  PIPRO_MINT,
  QR_TYPES,
  QrType,
  TEST_MINT,
} from './solanaPay';

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
  const [useTest, setUseTest] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const shotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const type = QR_TYPES[qrType];
  // Test switch only exists while TEST_MINT is set; it vanishes in production.
  const activeMint = useTest && TEST_MINT ? TEST_MINT : PIPRO_MINT;

  // Switching type clears the card so the badge on screen always matches the
  // selected type — a member must never see a marchant badge.
  const pickType = (t: QrType) => {
    setQrType(t);
    setUrl(null);
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
        mint: activeMint,
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
        message: buildWebLink({
          recipient: wallet.trim(),
          label: name,
          amount,
          test: useTest,
        }),
      });
    } catch {}
  };

  // Fallback for wallets that can't scan a saved image and chat apps that
  // don't make a "solana:" link tappable: paste-in works everywhere.
  const copyAddress = () => {
    Clipboard.setString(wallet.trim());
    Alert.alert('Address copied');
  };

  const copyAmount = () => {
    Clipboard.setString(amount.trim());
    Alert.alert('Amount copied');
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
      <Text style={styles.label}>Your wallet address</Text>
      <TextInput
        style={styles.input}
        value={wallet}
        onChangeText={setWallet}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Receiver wallet address"
        placeholderTextColor="#6c6285"
      />
      <Text style={styles.label}>Amount (optional)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Leave empty to let sender choose"
        placeholderTextColor="#6c6285"
      />
      <Text style={styles.label}>
        {useTest ? 'TEST token contract (devnet)' : 'PIPRO token contract (mint)'}
      </Text>
      <View style={[styles.lockedField, useTest && styles.lockedFieldTest]}>
        <Text
          style={[styles.lockedText, useTest && styles.lockedTextTest]}
          numberOfLines={1}
          ellipsizeMode="middle">
          {activeMint}
        </Text>
        <Text style={styles.lockedBadge}>{useTest ? '🧪 TEST' : '🔒 Locked'}</Text>
      </View>

      {!!TEST_MINT && (
        <TouchableOpacity
          style={styles.testRow}
          onPress={() => {
            setUseTest(!useTest);
            setUrl(null); // stale card would show the other token's QR
          }}>
          <View style={[styles.checkbox, useTest && styles.checkboxOn]}>
            {useTest && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.testLabel}>
            Use devnet TEST token (not real PIPRO)
          </Text>
        </TouchableOpacity>
      )}
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
            <View style={[styles.badge, useTest && styles.badgeTest]}>
              <Text style={styles.badgeText}>
                {useTest ? '🧪 TEST CARD — NOT REAL PIPRO' : type.badge}
              </Text>
            </View>
            <Text style={styles.cardMessage}>
              {useTest
                ? 'Devnet test card for testing only. Holds no value.'
                : type.note}
            </Text>
          </ViewShot>
          <TouchableOpacity style={styles.button} onPress={shareImage}>
            <Text style={styles.buttonText}>Share QR image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonAlt} onPress={shareLink}>
            <Text style={styles.buttonAltText}>Share link</Text>
          </TouchableOpacity>
          {/* Works with any wallet: no scanner, no "solana:" link support
              needed — the sender pastes these into their wallet's Send screen. */}
          <View style={styles.copyRow}>
            <TouchableOpacity style={styles.copyBtn} onPress={copyAddress}>
              <Text style={styles.copyBtnText}>📋 Copy address</Text>
            </TouchableOpacity>
            {!!amount.trim() && (
              <TouchableOpacity style={styles.copyBtn} onPress={copyAmount}>
                <Text style={styles.copyBtnText}>📋 Copy amount</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
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
  lockedFieldTest: {borderColor: '#e07a2f'},
  lockedText: {flex: 1, color: GOLD, fontSize: 13, fontWeight: '600'},
  lockedTextTest: {color: '#e07a2f'},
  testRow: {flexDirection: 'row', alignItems: 'center', marginTop: 12},
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#e07a2f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxOn: {backgroundColor: '#e07a2f'},
  checkmark: {color: '#0d0b14', fontSize: 14, fontWeight: '900'},
  testLabel: {color: '#e07a2f', fontSize: 13, fontWeight: '700', flex: 1},
  badgeTest: {backgroundColor: '#e07a2f'},
  copyRow: {flexDirection: 'row', gap: 10, marginTop: 10},
  copyBtn: {
    flex: 1,
    borderColor: '#2c2440',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  copyBtnText: {color: '#9a8db5', fontSize: 13, fontWeight: '700'},
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
