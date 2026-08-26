import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import GenerateScreen from './src/GenerateScreen';
import ScanScreen from './src/ScanScreen';
import BalanceScreen from './src/BalanceScreen';
import AdBanner from './src/components/AdBanner';
import mobileAds from 'react-native-google-mobile-ads';
import { parseDeepLink, DeepLink } from './src/solanaPay';

const logo = require('./src/assets/pipro-logo.png');

type Screen = 'home' | 'generate' | 'scan' | 'balance';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [link, setLink] = useState<DeepLink | null>(null);

  // Initialize AdMob SDK on startup
  useEffect(() => {
    mobileAds()
      .initialize()
      .then(adapterStatuses => {
        console.log('MobileAds initialized:', adapterStatuses);
      })
      .catch(err => {
        console.log('MobileAds init warning:', err);
      });
  }, []);

  // Another app can open us at a screen with fields pre-filled:
  //   pipro://generate?wallet=<address>&name=<label>&amount=<number>
  useEffect(() => {
    const go = (url: string | null) => {
      const parsed = url && parseDeepLink(url);
      if (parsed) {
        setLink(parsed);
        setScreen(parsed.screen);
      }
    };
    Linking.getInitialURL().then(go); // cold start
    const sub = Linking.addEventListener('url', e => go(e.url)); // already running
    return () => sub.remove();
  }, []);

  // Hardware back returns home instead of exiting the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'home') {
        setScreen('home');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  if (screen === 'home') {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.home}>
          <StatusBar barStyle="light-content" backgroundColor="#0d0b14" />
          <View style={styles.hero}>
            <Image source={logo} style={styles.logo} />
            <Text style={styles.title}>PIPRO</Text>
            <Text style={styles.subtitle}>P2P COMMUNITY</Text>
            <Text style={styles.description}>
              Generate and scan verified token QR codes. Every transfer is
              pre-filled with the official token contract — protecting you
              from fake tokens and wrong addresses.
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setScreen('generate')}
            >
              <Text style={styles.primaryBtnText}>Generate QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setScreen('scan')}
            >
              <Text style={styles.secondaryBtnText}>Scan QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tertiaryBtn}
              onPress={() => setScreen('balance')}
            >
              <Text style={styles.tertiaryBtnText}>💰 Check Token Balance</Text>
            </TouchableOpacity>
          </View>
          <AdBanner />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0d0b14" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setScreen('home')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.backText}>‹ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {screen === 'generate'
              ? 'Generate QR'
              : screen === 'scan'
              ? 'Scan QR'
              : 'Check Balance'}
          </Text>
          <Image source={logo} style={styles.headerLogo} />
        </View>
        {screen === 'generate' ? (
          <GenerateScreen
            initialWallet={link?.wallet}
            initialName={link?.name}
            initialAmount={link?.amount}
          />
        ) : screen === 'scan' ? (
          <ScanScreen />
        ) : (
          <BalanceScreen
            onNavigateToGenerate={walletAddress => {
              setLink({ screen: 'generate', wallet: walletAddress });
              setScreen('generate');
            }}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const GOLD = '#d4a437';

const styles = StyleSheet.create({
  home: {
    flex: 1,
    backgroundColor: '#0d0b14',
    justifyContent: 'space-between',
    padding: 24,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 220, height: 220, borderRadius: 110 },
  title: {
    marginTop: 24,
    fontSize: 36,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 6,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#9a8db5',
    letterSpacing: 3,
  },
  description: {
    marginTop: 18,
    fontSize: 13,
    lineHeight: 20,
    color: '#b5aacd',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  actions: { gap: 12, paddingBottom: 12 },
  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0d0b14', fontSize: 16, fontWeight: '800' },
  secondaryBtn: {
    borderColor: GOLD,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  secondaryBtnText: { color: GOLD, fontSize: 16, fontWeight: '700' },
  tertiaryBtn: {
    backgroundColor: '#1a142c',
    borderWidth: 1,
    borderColor: '#392d5c',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  tertiaryBtnText: { color: '#c7bfe6', fontSize: 15, fontWeight: '700' },

  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0b14',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { minWidth: 60 },
  backText: { color: GOLD, fontSize: 16, fontWeight: '700' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerLogo: { width: 32, height: 32, borderRadius: 16 },
});

export default App;
