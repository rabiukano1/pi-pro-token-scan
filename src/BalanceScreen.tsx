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
import {
  PIPRO_MINT,
  buildTxHistory,
  filterTransfers,
  isBase58Address,
} from './solanaPay';
import type {TxFilter} from './solanaPay';
import AdBanner from './components/AdBanner';
import DatePickerModal from './components/DatePickerModal';
import {C, GOLD, toISODate} from './theme';
import {useInterstitialAd} from './hooks/useInterstitialAd';

const RPC_URL = 'https://api.mainnet-beta.solana.com';
// ponytail: the date filter sifts this window client-side rather than paging
// the RPC. Raise it or page with `before` if people need older history.
const TX_HISTORY_LIMIT = 50;

const TX_FILTERS: {key: TxFilter; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'in', label: '↓ Received'},
  {key: 'out', label: '↑ Sent'},
];


interface LastReceivedInfo {
  amount: string;
  beforeAmount: string;
  afterAmount: string;
  timeFormatted: string;
  timeRelative: string;
  signature?: string;
}

interface TxItem extends LastReceivedInfo {
  direction: 'in' | 'out';
  delta: number; // signed, in UI units — positive is received
  blockTime: number | null;
}


function formatAmount(n: number, decimals: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
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
  const [transactions, setTransactions] = useState<TxItem[]>([]);
  const [showAllTx, setShowAllTx] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const {showInterstitialIfAvailable} = useInterstitialAd();

  const resetFilters = () => {
    setTxFilter('all');
    setFromDate('');
    setToDate('');
  };

  const todayISO = toISODate(new Date());
  const isToday = fromDate === todayISO && toDate === todayISO;

  // Picking a start after the end (or an end before the start) can only ever
  // return nothing, so the other bound gives way instead of going empty.
  const pickDate = (iso: string) => {
    if (picking === 'from') {
      setFromDate(iso);
      if (toDate && iso > toDate) {
        setToDate('');
      }
    } else if (picking === 'to') {
      setToDate(iso);
      if (fromDate && iso < fromDate) {
        setFromDate('');
      }
    }
    setShowAllTx(false);
    setPicking(null);
  };

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
    setTransactions([]);
    setShowAllTx(false);
    resetFilters();
    setHasChecked(false);

    // Trigger full-screen Interstitial Ad
    showInterstitialIfAvailable();

    try {
      // 1. Query Token Accounts for PIPRO
      const response = await fetch(RPC_URL, {
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
          const currentUi = total / Math.pow(10, decimals);
          const formatted = currentUi.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
          });
          setBalance(formatted);

          // 2. Fetch recent PIPRO transfer history for this token account
          const ataPubkey = accounts[0].pubkey;
          try {
            const sigResponse = await fetch(RPC_URL, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'getSignaturesForAddress',
                params: [ataPubkey, {limit: TX_HISTORY_LIMIT}],
              }),
            });
            const sigData = await sigResponse.json();
            const signatures: any[] = (sigData.result || []).filter((sig: any) => !sig.err);

            if (signatures.length > 0) {
              // One batched JSON-RPC call instead of N round trips — the public
              // mainnet RPC rate-limits per request, not per transaction.
              const txResponse = await fetch(RPC_URL, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(
                  signatures.map((sig: any, i: number) => ({
                    jsonrpc: '2.0',
                    id: i,
                    method: 'getTransaction',
                    params: [
                      sig.signature,
                      {encoding: 'jsonParsed', maxSupportedTransactionVersion: 0},
                    ],
                  })),
                ),
              });
              const txBatch = await txResponse.json();

              // Batch responses may come back out of order — index them by id
              const byId = new Map<number, any>();
              for (const entry of Array.isArray(txBatch) ? txBatch : []) {
                byId.set(entry.id, entry.result);
              }

              const history: TxItem[] = buildTxHistory(
                signatures,
                signatures.map((_: any, i: number) => byId.get(i)),
                trimmed,
                PIPRO_MINT,
                decimals,
                currentUi,
              ).map(item => ({
                signature: item.signature,
                direction: item.delta > 0 ? ('in' as const) : ('out' as const),
                amount: formatAmount(Math.abs(item.delta), decimals),
                delta: item.delta,
                blockTime: item.blockTime,
                beforeAmount: formatAmount(item.balanceAfter - item.delta, decimals),
                afterAmount: formatAmount(item.balanceAfter, decimals),
                ...(item.blockTime
                  ? formatTimestamp(item.blockTime)
                  : {timeFormatted: 'Recently confirmed', timeRelative: 'Recent'}),
              }));

              setTransactions(history);

              const newestDeposit = history.find(item => item.direction === 'in');
              if (newestDeposit) {
                setLastReceived(newestDeposit);
              }
            }
          } catch {
            // Failed to fetch tx history (non-critical, balance is already set)
          }
        }
        setHasChecked(true);
      }
    } catch {
      Alert.alert('Network Error', 'Unable to connect to Solana mainnet. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const visibleTx = filterTransfers(transactions, txFilter, fromDate, toDate);
  const isFiltered =
    txFilter !== 'all' || fromDate.length > 0 || toDate.length > 0;

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
      {/* Verified mint, shown as a chip rather than a full-width card so the
          wallet input stays the first thing the eye lands on. */}
      <View style={styles.mintChip}>
        <View style={styles.dotGreen} />
        <Text style={styles.mintChipLabel}>VERIFIED PIPRO MINT</Text>
        <Text
          style={styles.mintChipValue}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {PIPRO_MINT}
        </Text>
      </View>

      <Text style={styles.fieldLabel}>WALLET ADDRESS</Text>
      <View style={[styles.inputShell, isFocused && styles.inputShellFocused]}>
        <TextInput
          style={styles.input}
          placeholder="Paste a Solana address"
          placeholderTextColor={C.dim}
          value={wallet}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChangeText={text => {
            setWallet(text);
            if (hasChecked) {
              setHasChecked(false);
              setBalance(null);
              setLastReceived(null);
              setTransactions([]);
              setShowAllTx(false);
              resetFilters();
            }
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {wallet.length > 0 ? (
          <TouchableOpacity
            style={styles.inputAction}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            onPress={() => {
              setWallet('');
              setBalance(null);
              setLastReceived(null);
              setTransactions([]);
              setShowAllTx(false);
              resetFilters();
              setHasChecked(false);
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

      <TouchableOpacity
        style={[styles.primaryBtn, isLoading && styles.primaryBtnDisabled]}
        onPress={handleCheckBalance}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={C.bg} />
            <Text style={styles.primaryBtnTextLoading}>Reading mainnet…</Text>
          </View>
        ) : (
          <Text style={styles.primaryBtnText}>Check balance</Text>
        )}
      </TouchableOpacity>

      {hasChecked && balance !== null && (
        <View style={styles.results}>
          {/* Balance hero */}
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>TOTAL BALANCE</Text>
            <View style={styles.heroAmountRow}>
              <Text
                style={styles.heroAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {balance}
              </Text>
              <Text style={styles.heroUnit}>PIPRO</Text>
            </View>
            <View style={styles.heroFoot}>
              <View style={styles.dotGreen} />
              <Text style={styles.heroFootText}>Live on-chain</Text>
            </View>
          </View>

          {/* Last received */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>LAST RECEIVED</Text>
              {lastReceived && (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{lastReceived.timeRelative}</Text>
                </View>
              )}
            </View>

            {lastReceived ? (
              <>
                <Text style={styles.deltaAmount}>
                  +{lastReceived.amount}
                  <Text style={styles.deltaUnit}> PIPRO</Text>
                </Text>

                <View style={styles.ledger}>
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerKey}>Before</Text>
                    <Text style={styles.ledgerVal}>
                      {lastReceived.beforeAmount}
                    </Text>
                  </View>
                  <View style={styles.ledgerDivider} />
                  <View style={styles.ledgerRow}>
                    <Text style={styles.ledgerKey}>After</Text>
                    <Text style={[styles.ledgerVal, styles.ledgerValStrong]}>
                      {lastReceived.afterAmount}
                    </Text>
                  </View>
                </View>

                <Text style={styles.timestamp}>{lastReceived.timeFormatted}</Text>

                {lastReceived.signature && (
                  <TouchableOpacity
                    style={styles.linkBtn}
                    onPress={() => openExplorer(lastReceived.signature)}
                  >
                    <Text style={styles.linkBtnText}>View on Solscan ↗</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                No incoming transfers in this wallet’s recent history.
              </Text>
            )}
          </View>

          {/* History */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>ACTIVITY</Text>
              <Text style={styles.cardCount}>
                {isFiltered
                  ? `${visibleTx.length} of ${transactions.length}`
                  : `${transactions.length}${
                      transactions.length === TX_HISTORY_LIMIT ? '+' : ''
                    }`}
              </Text>
            </View>

            {transactions.length > 0 && (
              <>
                <View style={styles.segment}>
                  {TX_FILTERS.map(f => (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.segmentBtn,
                        txFilter === f.key && styles.segmentBtnOn,
                      ]}
                      onPress={() => {
                        setTxFilter(f.key);
                        setShowAllTx(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          txFilter === f.key && styles.segmentTextOn,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.dateRow}>
                  <TouchableOpacity
                    style={styles.dateField}
                    onPress={() => setPicking('from')}
                  >
                    <Text style={styles.dateLabel}>FROM</Text>
                    <View style={styles.dateBox}>
                      <Text
                        style={[
                          styles.dateValue,
                          !fromDate && styles.dateValueEmpty,
                        ]}
                      >
                        {fromDate || 'Any'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dateField}
                    onPress={() => setPicking('to')}
                  >
                    <Text style={styles.dateLabel}>TO</Text>
                    <View style={styles.dateBox}>
                      <Text
                        style={[
                          styles.dateValue,
                          !toDate && styles.dateValueEmpty,
                        ]}
                      >
                        {toDate || 'Any'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.todayBtn, isToday && styles.todayBtnOn]}
                    onPress={() => {
                      if (isToday) {
                        setFromDate('');
                        setToDate('');
                      } else {
                        setFromDate(todayISO);
                        setToDate(todayISO);
                      }
                      setShowAllTx(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.todayText,
                        isToday && styles.todayTextOn,
                      ]}
                    >
                      Today
                    </Text>
                  </TouchableOpacity>
                </View>

                {isFiltered && (
                  <TouchableOpacity
                    style={styles.clearFilterBtn}
                    onPress={resetFilters}
                  >
                    <Text style={styles.clearFilterText}>Clear filters</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {visibleTx.length === 0 ? (
              <Text style={styles.emptyText}>
                {transactions.length === 0
                  ? 'No PIPRO transfers in this wallet’s recent history.'
                  : 'Nothing matches this filter.'}
              </Text>
            ) : (
              <>
                {(showAllTx ? visibleTx : visibleTx.slice(0, 5)).map(item => {
                  const incoming = item.direction === 'in';
                  return (
                    <TouchableOpacity
                      key={item.signature}
                      style={styles.txRow}
                      onPress={() => openExplorer(item.signature)}
                      activeOpacity={0.6}
                    >
                      <View
                        style={[
                          styles.txIcon,
                          incoming ? styles.txIconIn : styles.txIconOut,
                        ]}
                      >
                        <Text
                          style={[
                            styles.txArrow,
                            incoming ? styles.inText : styles.outText,
                          ]}
                        >
                          {incoming ? '↓' : '↑'}
                        </Text>
                      </View>

                      <View style={styles.txBody}>
                        <Text style={styles.txTitle}>
                          {incoming ? 'Received' : 'Sent'}
                        </Text>
                        <Text style={styles.txTime}>{item.timeFormatted}</Text>
                      </View>

                      <View style={styles.txTail}>
                        <Text
                          style={[
                            styles.txAmount,
                            incoming ? styles.inText : styles.outText,
                          ]}
                          numberOfLines={1}
                        >
                          {incoming ? '+' : '−'}
                          {item.amount}
                        </Text>
                        <Text style={styles.txRelative}>{item.timeRelative}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {visibleTx.length > 5 && (
                  <TouchableOpacity
                    style={styles.showMoreBtn}
                    onPress={() => setShowAllTx(!showAllTx)}
                  >
                    <Text style={styles.showMoreText}>
                      {showAllTx ? 'Show less' : `Show all ${visibleTx.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          {onNavigateToGenerate && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => onNavigateToGenerate(wallet.trim())}
            >
              <Text style={styles.secondaryBtnText}>
                Generate QR for this address
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <DatePickerModal
        visible={picking !== null}
        title={picking === 'from' ? 'START DATE' : 'END DATE'}
        value={picking === 'from' ? fromDate : toDate}
        onSelect={pickDate}
        onClear={() => {
          if (picking === 'from') {
            setFromDate('');
          } else {
            setToDate('');
          }
          setShowAllTx(false);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />

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

  mintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 22,
  },
  mintChipLabel: {
    color: C.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  mintChipValue: {
    flex: 1,
    color: C.dim,
    fontSize: 10,
    fontFamily: 'monospace',
    textAlign: 'right',
  },

  fieldLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 9,
  },
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

  primaryBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnDisabled: {opacity: 0.6},
  primaryBtnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  primaryBtnTextLoading: {color: C.bg, fontSize: 14, fontWeight: '700'},
  loadingRow: {flexDirection: 'row', alignItems: 'center', gap: 9},

  results: {gap: 14, marginTop: 22},

  heroCard: {
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  heroLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 10,
    maxWidth: '100%',
  },
  heroAmount: {
    color: C.text,
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  heroUnit: {color: GOLD, fontSize: 15, fontWeight: '800', letterSpacing: 0.5},
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  heroFootText: {color: C.green, fontSize: 11, fontWeight: '700'},

  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.borderSoft,
    padding: 16,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  cardCount: {color: C.dim, fontSize: 11, fontWeight: '700'},
  pill: {
    backgroundColor: C.raised,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {color: C.muted, fontSize: 10, fontWeight: '700'},

  deltaAmount: {color: C.green, fontSize: 28, fontWeight: '900'},
  deltaUnit: {color: C.green, fontSize: 14, fontWeight: '700'},

  ledger: {
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 13,
    marginTop: 14,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  ledgerDivider: {height: 1, backgroundColor: C.borderSoft},
  ledgerKey: {color: C.dim, fontSize: 12, fontWeight: '600'},
  ledgerVal: {color: C.muted, fontSize: 13, fontWeight: '700'},
  ledgerValStrong: {color: C.text},
  timestamp: {color: C.dim, fontSize: 11, marginTop: 11},

  linkBtn: {alignSelf: 'flex-start', marginTop: 12},
  linkBtnText: {color: C.blue, fontSize: 12, fontWeight: '800'},

  emptyText: {color: C.dim, fontSize: 12.5, lineHeight: 19, paddingVertical: 4},

  segment: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentBtnOn: {backgroundColor: GOLD},
  segmentText: {color: C.muted, fontSize: 12, fontWeight: '700'},
  segmentTextOn: {color: C.bg, fontWeight: '800'},

  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  dateField: {flex: 1},
  dateLabel: {
    color: C.dim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 5,
  },
  dateBox: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.borderSoft,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  dateValue: {color: C.text, fontSize: 12.5, fontWeight: '700'},
  dateValueEmpty: {color: C.dim, fontWeight: '600'},
  todayBtn: {
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.border,
  },
  todayBtnOn: {backgroundColor: GOLD, borderColor: GOLD},
  todayText: {color: C.muted, fontSize: 12, fontWeight: '800'},
  todayTextOn: {color: C.bg},
  clearFilterBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: C.raised,
    alignItems: 'center',
  },
  clearFilterText: {color: GOLD, fontSize: 12, fontWeight: '700'},

  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
    marginTop: 4,
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconIn: {backgroundColor: C.greenDim},
  txIconOut: {backgroundColor: C.redDim},
  txArrow: {fontSize: 15, fontWeight: '900'},
  txBody: {flex: 1},
  txTitle: {color: C.text, fontSize: 13.5, fontWeight: '700'},
  txTime: {color: C.dim, fontSize: 10.5, marginTop: 2},
  txTail: {alignItems: 'flex-end', maxWidth: '42%'},
  txAmount: {fontSize: 14, fontWeight: '800'},
  txRelative: {color: C.dim, fontSize: 10.5, marginTop: 2},
  inText: {color: C.green},
  outText: {color: C.red},

  showMoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
    marginTop: 4,
  },
  showMoreText: {color: GOLD, fontSize: 12, fontWeight: '800'},

  secondaryBtn: {
    backgroundColor: C.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {color: GOLD, fontSize: 13, fontWeight: '800'},
});
