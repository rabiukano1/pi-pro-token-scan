import React, {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {PIPRO_MINT, isBase58Address} from './solanaPay';
import AdBanner from './components/AdBanner';
import {useInterstitialAd} from './hooks/useInterstitialAd';

const GOLD = '#d4a437';

interface LastReceivedInfo {
  amount: string;
  timeFormatted: string;
  timeRelative: string;
  signature?: string;
}

interface BalanceScreenProps {
  onNavigateToGenerate?: (walletAddress: string) => void;
}

function formatTimestamp(timestampSec: number): {timeFormatted: string; timeRelative: string} {
  const date = new Date(timestampSec * 1000);
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  let timeRelative = '';
  if (diffSec < 60) {
    timeRelative = 'Just now';
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    timeRelative = `${mins} min${mins > 1 ? 's' : ''} ago`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    timeRelative = `${hours} hr${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffSec / 86400);
    timeRelative = `${days} day${days > 1 ? 's' : ''} ago`;
  }

  const timeFormatted =
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' • ' +
    date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

  return {timeFormatted, timeRelative};
}

export default function BalanceScreen({onNavigateToGenerate}: BalanceScreenProps) {
  const [wallet, setWallet] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [lastReceived, setLastReceived] = useState<LastReceivedInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const {showInterstitialIfAvailable} = useInterstitialAd();

  const pasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) {
        setWallet(text.trim());
      }
    } catch {
      // ignore clipboard read failure
    }
  };

  const handleCheckBalance = async () => {
    const trimmed = wallet.trim();
    if (!trimmed) {
      Alert.alert('Wallet Required', 'Please enter or paste a Solana wallet address.');
      return;
    }
    if (!isBase58Address(trimmed)) {
      Alert.alert('Invalid Address', 'Please enter a valid Solana public wallet address (Base58).');
      return;
    }

    Keyboard.dismiss();
    setIsLoading(true);
    setBalance(null);
    setLastReceived(null);
    setHasChecked(false);

    // Trigger full-screen Interstitial Ad
    showInterstitialIfAvailable();

    try {
      // 1. Query Token Accounts for PIPRO
      const response = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            trimmed,
            {mint: PIPRO_MINT},
            {encoding: 'jsonParsed'},
          ],
        }),
      });

      const data = await response.json();

      if (data.error) {
        Alert.alert('Query Error', data.error.message || 'Failed to query token balance on Solana.');
      } else {
        const accounts = data.result?.value;
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

          // 2. Fetch Transaction Signatures for the Token Account
          const ataPubkey = accounts[0].pubkey;
          try {
            const sigResponse = await fetch('https://api.mainnet-beta.solana.com', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'getSignaturesForAddress',
                params: [ataPubkey, {limit: 5}],
              }),
            });
            const sigData = await sigResponse.json();
            const signatures = sigData.result;

            if (signatures && signatures.length > 0) {
              // Inspect top recent transactions to find the last received transfer
              for (const sigInfo of signatures) {
                if (sigInfo.err) continue; // Skip failed transactions

                const txResponse = await fetch('https://api.mainnet-beta.solana.com', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'getTransaction',
                    params: [
                      sigInfo.signature,
                      {
                        encoding: 'jsonParsed',
                        maxSupportedTransactionVersion: 0,
                      },
                    ],
                  }),
                });

                const txData = await txResponse.json();
                const tx = txData.result;
                if (!tx || !tx.meta) continue;

                // Check pre vs post token balances for this account / owner
                const preList = tx.meta.preTokenBalances || [];
                const postList = tx.meta.postTokenBalances || [];

                const pre = preList.find(
                  (b: any) =>
                    (b.owner === trimmed || b.mint === PIPRO_MINT) &&
                    b.mint === PIPRO_MINT,
                );
                const post = postList.find(
                  (b: any) =>
                    (b.owner === trimmed || b.mint === PIPRO_MINT) &&
                    b.mint === PIPRO_MINT,
                );

                let receivedAmountNumber = 0;
                if (post) {
                  const postAmt = Number(post.uiTokenAmount?.uiAmount || 0);
                  const preAmt = Number(pre?.uiTokenAmount?.uiAmount || 0);
                  if (postAmt > preAmt) {
                    receivedAmountNumber = postAmt - preAmt;
                  }
                }

                // If not found in balances, check parsed instructions
                if (receivedAmountNumber === 0 && tx.transaction?.message?.instructions) {
                  for (const ix of tx.transaction.message.instructions) {
                    if (
                      ix.program === 'spl-token' &&
                      (ix.parsed?.type === 'transfer' || ix.parsed?.type === 'transferChecked')
                    ) {
                      const info = ix.parsed.info;
                      if (info.destination === ataPubkey || info.wallet === trimmed) {
                        const amt = info.tokenAmount?.uiAmount || (Number(info.amount) / Math.pow(10, decimals));
                        if (amt > 0) {
                          receivedAmountNumber = amt;
                          break;
                        }
                      }
                    }
                  }
                }

                if (receivedAmountNumber > 0) {
                  const blockTime = tx.blockTime || sigInfo.blockTime;
                  const {timeFormatted, timeRelative} = blockTime
                    ? formatTimestamp(blockTime)
                    : {timeFormatted: 'Recently confirmed', timeRelative: 'Recent'};

                  setLastReceived({
                    amount: receivedAmountNumber.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: decimals,
                    }),
                    timeFormatted,
                    timeRelative,
                    signature: sigInfo.signature,
                  });
                  break; // Found the latest received transfer!
                }
              }
            }
          } catch {
            // Failed to fetch tx history (non-critical, balance is already set)
          }
        }
        setHasChecked(true);
      }
    } catch (err) {
      Alert.alert('Network Error', 'Unable to connect to Solana mainnet. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const openExplorer = (signature?: string) => {
    if (signature) {
      Linking.openURL(`https://solscan.io/tx/${signature}`).catch(() => {});
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text style={styles.headerSubtitle}>
        Check live PIPRO balance & latest incoming transfer from Solana Mainnet.
      </Text>

          {/* Token Contract Info Box */}
          <View style={styles.tokenCard}>
            <View style={styles.tokenRow}>
              <Text style={styles.tokenTitle}>Official PIPRO Mint</Text>
              <Text style={styles.verifiedBadge}>✓ Verified Token</Text>
            </View>
            <Text style={styles.tokenMint} numberOfLines={1} ellipsizeMode="middle">
              {PIPRO_MINT}
            </Text>
          </View>

          {/* Wallet Input Field */}
          <Text style={styles.label}>PUBLIC WALLET ADDRESS</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              placeholderTextColor="#5a5270"
              value={wallet}
              onChangeText={text => {
                setWallet(text);
                if (hasChecked) {
                  setHasChecked(false);
                  setBalance(null);
                  setLastReceived(null);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {wallet.length > 0 ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  setWallet('');
                  setBalance(null);
                  setLastReceived(null);
                  setHasChecked(false);
                }}
              >
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.pasteBtn} onPress={pasteFromClipboard}>
                <Text style={styles.pasteBtnText}>Paste</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Check Balance Button */}
          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleCheckBalance}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#0d0b14" />
                <Text style={styles.buttonTextLoading}>Querying Solana Mainnet...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Check Balance & Activity</Text>
            )}
          </TouchableOpacity>

          {/* Results Box */}
          {hasChecked && balance !== null && (
            <View style={styles.resultsWrapper}>
              {/* Total Balance Card */}
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>CURRENT PIPRO BALANCE</Text>
                <Text style={styles.resultAmount}>
                  {balance} <Text style={styles.resultUnit}>PIPRO</Text>
                </Text>
                <Text style={styles.resultSubtext}>
                  ✓ Live on-chain balance
                </Text>
              </View>

              {/* Last Received Card */}
              <View style={styles.receivedCard}>
                <View style={styles.receivedHeader}>
                  <Text style={styles.receivedTag}>📥 LAST RECEIVED</Text>
                  {lastReceived && (
                    <Text style={styles.receivedRelative}>{lastReceived.timeRelative}</Text>
                  )}
                </View>

                {lastReceived ? (
                  <View style={styles.receivedBody}>
                    <Text style={styles.receivedAmount}>
                      +{lastReceived.amount}{' '}
                      <Text style={styles.receivedUnit}>PIPRO</Text>
                    </Text>
                    <Text style={styles.receivedTime}>
                      🕒 {lastReceived.timeFormatted}
                    </Text>

                    {lastReceived.signature && (
                      <TouchableOpacity
                        style={styles.explorerLink}
                        onPress={() => openExplorer(lastReceived.signature)}
                      >
                        <Text style={styles.explorerLinkText}>
                          View on Solscan ↗
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noReceivedText}>
                    No recent incoming transfers found for this address.
                  </Text>
                )}
              </View>

              {onNavigateToGenerate && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => onNavigateToGenerate(wallet.trim())}
                >
                  <Text style={styles.actionBtnText}>⚡ Generate QR for this Address</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* AdMob Banner inside scroll flow */}
          <View style={styles.bannerWrapper}>
            <AdBanner />
          </View>
        </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0d0b14',
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  bannerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 24,
    marginBottom: 20,
  },
  headerSubtitle: {
    color: '#9a8db5',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  tokenCard: {
    backgroundColor: '#161226',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d2448',
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tokenTitle: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  tokenMint: {
    color: '#9a8db5',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  label: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#161226',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 64,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2d2448',
  },
  pasteBtn: {
    position: 'absolute',
    right: 10,
    backgroundColor: '#2d2448',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pasteBtnText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  clearBtnText: {
    color: '#9a8db5',
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    backgroundColor: GOLD,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#0d0b14',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  buttonTextLoading: {
    color: '#0d0b14',
    fontSize: 14,
    fontWeight: '700',
  },
  resultsWrapper: {
    gap: 14,
    marginTop: 6,
  },
  resultCard: {
    backgroundColor: '#18142a',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  resultLabel: {
    color: '#9a8db5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  resultAmount: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultUnit: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800',
  },
  resultSubtext: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
  },
  receivedCard: {
    backgroundColor: '#141c24',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e384d',
  },
  receivedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  receivedTag: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  receivedRelative: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#0c283c',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  receivedBody: {
    gap: 4,
  },
  receivedAmount: {
    color: '#4ade80',
    fontSize: 24,
    fontWeight: '800',
  },
  receivedUnit: {
    color: '#86efac',
    fontSize: 16,
    fontWeight: '700',
  },
  receivedTime: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  noReceivedText: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
  },
  explorerLink: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#0c283c',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e4b6e',
  },
  explorerLinkText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  actionBtn: {
    backgroundColor: '#251e3e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#433668',
    alignItems: 'center',
    marginTop: 4,
  },
  actionBtnText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
  },
});
