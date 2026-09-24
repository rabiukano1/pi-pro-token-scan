import React, {useEffect, useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, GOLD, toISODate} from '../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface Props {
  visible: boolean;
  title: string;
  value: string; // YYYY-MM-DD, or '' for no date set
  onSelect: (iso: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export default function DatePickerModal({
  visible,
  title,
  value,
  onSelect,
  onClear,
  onClose,
}: Props) {
  // Which month the grid is showing. Separate from the selection so paging
  // around does not change what is picked.
  const [cursor, setCursor] = useState(() => new Date());

  // Reopening on a different field must land on that field's month, so the
  // cursor is seeded every time the sheet becomes visible.
  useEffect(() => {
    if (visible) {
      setCursor(value ? new Date(value + 'T00:00:00') : new Date());
    }
  }, [visible, value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const todayISO = toISODate(new Date());

  const cells: (number | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({length: dayCount}, (_, i) => i + 1),
  ];

  const shiftMonth = (by: number) => setCursor(new Date(year, month + by, 1));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps inside the sheet so only the backdrop closes it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthRow}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => shiftMonth(-1)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            >
              <Text style={styles.navText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {MONTHS[month]} {year}
            </Text>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => shiftMonth(1)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            >
              <Text style={styles.navText}>›</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            {WEEKDAYS.map((d, i) => (
              <View key={`wd-${i}`} style={styles.cell}>
                <Text style={styles.weekday}>{d}</Text>
              </View>
            ))}

            {cells.map((day, i) => {
              if (day === null) {
                return <View key={`blank-${i}`} style={styles.cell} />;
              }
              const iso = toISODate(new Date(year, month, day));
              const selected = iso === value;
              const isToday = iso === todayISO;
              // Nothing can have settled in the future, so those days are dead.
              const disabled = iso > todayISO;

              return (
                <View key={iso} style={styles.cell}>
                  <TouchableOpacity
                    style={[
                      styles.day,
                      isToday && styles.dayToday,
                      selected && styles.daySelected,
                    ]}
                    disabled={disabled}
                    onPress={() => onSelect(iso)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && styles.dayTextToday,
                        selected && styles.dayTextSelected,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={onClear}>
              <Text style={styles.actionText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => onSelect(todayISO)}
            >
              <Text style={[styles.actionText, styles.actionTextGold]}>
                Today
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
  },
  title: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {color: GOLD, fontSize: 20, fontWeight: '800', lineHeight: 22},
  monthLabel: {color: C.text, fontSize: 15, fontWeight: '800'},

  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {color: C.dim, fontSize: 10, fontWeight: '800'},
  day: {
    width: '84%',
    height: '84%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {borderWidth: 1, borderColor: GOLD},
  daySelected: {backgroundColor: GOLD, borderColor: GOLD},
  dayText: {color: C.text, fontSize: 13, fontWeight: '600'},
  dayTextToday: {color: GOLD, fontWeight: '800'},
  dayTextSelected: {color: C.bg, fontWeight: '800'},
  dayTextDisabled: {color: C.borderSoft},

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: C.raised,
    alignItems: 'center',
  },
  actionText: {color: C.muted, fontSize: 13, fontWeight: '700'},
  actionTextGold: {color: GOLD, fontWeight: '800'},
});
