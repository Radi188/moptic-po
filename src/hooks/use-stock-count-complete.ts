import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import {
  completeStockCount,
  fetchStockCountItems,
  type StockCountItem,
} from '@/api/stock-count';
import { ALL_ITEMS_PER_PAGE } from '@/constants/stock-count';
import { useTranslation } from '@/contexts/i18n';

type Options = {
  id: string;
  /** Empty completes every line still open; otherwise just that category's. */
  categoryId: string;
  categoryName: string;
  /** Called after a successful completion so the caller can refresh. */
  onDone: () => void;
};

/**
 * Shared "finalize this scope" flow — used for a single category and for the
 * rest of the count. Validates against every line in scope, not just the ones
 * on screen (search and the diff toggle narrow the visible list), then confirms
 * before completing.
 */
export function useStockCountComplete({ id, categoryId, categoryName, onDone }: Options) {
  const { t } = useTranslation();
  const [completing, setCompleting] = useState(false);
  const scoped = !!categoryId;

  const run = useCallback(async () => {
    setCompleting(true);
    try {
      await completeStockCount(id, categoryId || undefined);
      onDone();
    } catch (e) {
      Alert.alert(
        t('transfers.updateFailedTitle'),
        e instanceof Error ? e.message : t('count.completeFailBody'),
      );
    } finally {
      setCompleting(false);
    }
  }, [id, categoryId, onDone, t]);

  const ask = useCallback(() => {
    Alert.alert(
      scoped ? t('count.completeCategoryTitle', { name: categoryName }) : t('count.completeTitle'),
      scoped ? t('count.completeCategoryBody', { name: categoryName }) : t('count.completeBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('count.complete'), style: 'destructive', onPress: run },
      ],
    );
  }, [scoped, categoryName, run, t]);

  const confirmComplete = useCallback(async () => {
    let pending: StockCountItem[];
    setCompleting(true);
    try {
      const result = await fetchStockCountItems({ id, categoryId, perPage: ALL_ITEMS_PER_PAGE });
      pending = result.items.filter((it) => !it.completed);
    } catch (e) {
      Alert.alert(
        t('transfers.updateFailedTitle'),
        e instanceof Error ? e.message : t('count.loadItemsError'),
      );
      return;
    } finally {
      setCompleting(false);
    }

    if (pending.length === 0) {
      Alert.alert(
        t('count.categoryCompleted'),
        scoped
          ? t('count.categoryCompletedBody', { name: categoryName })
          : t('count.countCompletedBody'),
      );
      return;
    }

    // A difference from the system quantity always needs a reason on record.
    const needsReason = pending.filter(
      (it) => it.countedQty != null && it.countedQty !== it.systemQty && !it.reason.trim(),
    ).length;
    if (needsReason > 0) {
      Alert.alert(t('count.reasonRequiredTitle'), t('count.reasonRequiredBody', { n: needsReason }));
      return;
    }

    const uncounted = pending.filter((it) => it.countedQty == null).length;
    if (uncounted > 0) {
      Alert.alert(t('count.uncountedTitle'), t('count.uncountedBody', { n: uncounted }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.continue'), onPress: ask },
      ]);
      return;
    }
    ask();
  }, [ask, scoped, categoryId, categoryName, id, t]);

  return { completing, confirmComplete };
}
