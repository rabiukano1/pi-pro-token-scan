import React, {useEffect, useRef, useState} from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera';
import {launchImageLibrary} from 'react-native-image-picker';
import BarcodeScanning from '@react-native-ml-kit/barcode-scanning';
import Share from 'react-native-share';
import {checkCard} from './solanaPay';
import AdBanner from './components/AdBanner';

const GOLD = '#d4a437';

export default function ScanScreen() {
  const [hasPermission, setHasPermission] = useState(false);
  const device = useCameraDevice('back');
  const busy = useRef(false); // debounce: camera fires the same code repeatedly

  useEffect(() => {
    Camera.requestCameraPermission().then(p =>
      setHasPermission(p === 'granted'),
    );
  }, []);

  const release = () => {
    busy.current = false;
  };

  const openWallet = async (url: string, recipient: string) => {
    try {
      // Hands off to Phantom/Solflare with the transfer pre-filled.
      // A sender without the token cannot complete it — the wallet blocks it.
      await Linking.openURL(url.trim());
    } catch {
      // No wallet installed (or Android hid it). Let them pass the address on
      // instead of hitting a dead end.
      Alert.alert(
        'No Solana wallet found',
        'Install Phantom or Solflare, or send yourself this address:\n\n' +
          recipient,
        [
          {text: 'Close', style: 'cancel'},
          {
            text: 'Share address',
            onPress: () => Share.open({message: recipient}).catch(() => {}),
          },
        ],
      );
    }
    release();
  };

  const handleCode = async (value?: string) => {
    if (busy.current || !value) {
      return;
    }
    busy.current = true;
    const result = checkCard(value);

    if (result.status === 'invalid') {
      Alert.alert('Not a PIPRO card', 'This QR is not a PIPRO payment card.', [
        {text: 'OK', onPress: release},
      ]);
      return;
    }
    // Wrong token = the exact fake-card case this app exists to catch.
    if (result.status === 'wrong-token') {
      Alert.alert(
        '⚠ NOT an official PIPRO card',
        'This QR sends a different token, not PIPRO. Do not use it.\n\nToken in QR:\n' +
          result.mint,
        [{text: 'OK', onPress: release}],
      );
      return;
    }

    // Confirm who is being paid before handing off to the wallet.
    const {recipient, label} = result.fields;
    const isTest = result.status === 'test-token';
    Alert.alert(
      isTest ? '🧪 TEST TOKEN — not real PIPRO' : '✓ Verified PIPRO card',
      (isTest ? 'Devnet test token. Switch your wallet to Devnet.\n\n' : '') +
        (label ? label + '\n\n' : '') +
        recipient.slice(0, 6) + '...' + recipient.slice(-6),
      [
        {text: 'Cancel', style: 'cancel', onPress: release},
        {text: 'Open wallet', onPress: () => openWallet(value, recipient)},
      ],
    );
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => handleCode(codes[0]?.value),
  });

  const pickImage = async () => {
    const res = await launchImageLibrary({mediaType: 'photo'});
    const uri = res.assets?.[0]?.uri;
    if (!uri) {
      return;
    }
    const barcodes = await BarcodeScanning.scan(uri);
    if (!barcodes.length) {
      Alert.alert('No QR code found in that image');
      return;
    }
    handleCode(barcodes[0].value);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Point your camera at a token QR code
      </Text>
      <View style={styles.cameraCard}>
        {hasPermission && device ? (
          <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={[styles.camera, styles.noCam]}>
            <Text style={styles.noCamText}>
              Camera permission needed to scan
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.note}>
        Scanned QR opens your wallet with the transfer pre-filled — fake or
        wrong tokens are blocked automatically.
      </Text>
      <TouchableOpacity style={styles.button} onPress={pickImage}>
        <Text style={styles.buttonText}>Open shared QR image</Text>
      </TouchableOpacity>
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 20, backgroundColor: '#0d0b14'},
  hint: {
    color: '#9a8db5',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  cameraCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  camera: {flex: 1},
  noCam: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161226',
  },
  noCamText: {color: '#9a8db5', fontSize: 14},
  note: {
    color: '#9a8db5',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
  button: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {color: '#0d0b14', fontSize: 15, fontWeight: '800'},
});
