import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { fetchLossSummary, type LossSummaryRow } from '@/api/stock-count';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatMoney } from '@/data/inventory';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { SkeletonList } from '@/components/skeleton';
import { useTheme } from '@/hooks/use-theme';

const OVER = '#30A46C';
const SHORT = '#e5484d';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function LossSummaryScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [rows, setRows] = useState<LossSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((d: Date) => {
    setLoading(true);
    setError(null);
    fetchLossSummary({ month: monthKey(d) })
      .then(setRows)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load loss report.');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  function shiftMonth(delta: number) {
    setMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  const isCurrentMonth = monthKey(month) === monthKey(new Date());

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Loss Report"
        subtitle="Over / short by branch"
        onBack={() => router.back()}
      />

      <View style={styles.monthRow}>
        <Pressable
          onPress={() => shiftMonth(-1)}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.monthBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={20} color={theme.text} />
        </Pressable>
        <ThemedText type="smallBold" style={styles.monthLabel}>
          {monthLabel(month)}
        </ThemedText>
        <Pressable
          onPress={() => shiftMonth(1)}
          disabled={isCurrentMonth}
          hitSlop={Spacing.two}
          style={({ pressed }) => [
            styles.monthBtn,
            (pressed || isCurrentMonth) && styles.pressed,
          ]}>
          <Ionicons name="chevron-forward" size={20} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item, index) => `${item.branchId}-${index}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <LossCard row={item} theme={theme} />}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? 'No loss data for this month.'}
            </ThemedText>
          )
        }
      />
    </ThemedView>
  );
}

function LossCard({ row, theme }: { row: LossSummaryRow; theme: ReturnType<typeof useTheme> }) {
  const net = row.netValue;
  const netColor = net < 0 ? SHORT : net > 0 ? OVER : theme.textSecondary;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.branchWrap}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {row.branchName || `Branch ${row.branchId}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {row.sessions} {row.sessions === 1 ? 'count' : 'counts'}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color: netColor }}>
          {net < 0 ? `-${formatMoney(Math.abs(net))}` : formatMoney(net)}
        </ThemedText>
      </View>
      <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
        <View style={styles.metric}>
          <Ionicons name="arrow-down" size={13} color={SHORT} />
          <ThemedText type="small" themeColor="textSecondary">
            Shortage {formatMoney(row.shortageValue)}
          </ThemedText>
        </View>
        <View style={styles.metric}>
          <Ionicons name="arrow-up" size={13} color={OVER} />
          <ThemedText type="small" themeColor="textSecondary">
            Overage {formatMoney(row.overageValue)}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingBottom: Spacing.three,
  },
  monthBtn: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontSize: 16,
    minWidth: 140,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  branchWrap: {
    flex: 1,
    gap: Spacing.half,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
