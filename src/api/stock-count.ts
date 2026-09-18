import { api } from '@/api/client';

/**
 * Server-managed stock counts (physical inventory / reconciliation).
 * Field names are mapped defensively — confirm against the backend.
 */

export type StockCountStatus = 'open' | 'completed';

export type StockCount = {
  id: string;
  reference: string;
  warehouseId: string;
  warehouseName: string;
  branchId: string;
  branchName: string;
  status: StockCountStatus;
  countDate: string;
  periodMonth: string;
  note: string;
  totalItems: number;
  countedItems: number;
  /** Net value (negative = net loss). */
  lossValue: number;
  shortageValue: number;
  overageValue: number;
};

export type StockCountTotals = {
  totalItems: number;
  countedItems: number;
  lossValue: number;
  shortageValue: number;
  overageValue: number;
};

export type StockCountDetail = StockCount & { totals: StockCountTotals };

export type StockCountItem = {
  detailId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  image: string;
  systemQty: number;
  /** null when not yet counted. */
  countedQty: number | null;
  reason: string;
  /** Category the line belongs to — a sub-category id on this backend. */
  categoryId: string;
  categoryName: string;
  mainCategoryId: string;
  /** Set when this line is itself a variant of another item. */
  variantOf: StockCountVariantRef | null;
  /** This line's own variants, when it is a parent item. */
  variants: StockCountVariant[];
  /** True once the line has been finalized (its category, or the whole count, was completed). */
  completed: boolean;
};

/** A variant row from `item_variations`. */
export type StockCountVariant = {
  variantItemId: string;
  itemCode: string;
  itemName: string;
  sku: string;
  spec: string;
  colorName: string;
};

export type StockCountVariantRef = {
  parentItemId: string;
  sku: string;
  spec: string;
  colorName: string;
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;
const str = (v: string | number | undefined | null) => (v == null ? '' : String(v));

function mapStatus(v: string | number | undefined): StockCountStatus {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('complete') || s.includes('finaliz') || s.includes('lock') || s === '2') {
    return 'completed';
  }
  return 'open';
}

// ---- Header / list ----

type RawWarehouseRef = { warehouse_name?: string; name?: string };

type RawBranchRef = { id?: number | string; branch_name?: string; name?: string };

type RawCount = {
  id?: number | string;
  reference?: string;
  warehouse_id?: number | string;
  warehouse?: RawWarehouseRef | null;
  branch_id?: number | string;
  branch?: RawBranchRef | null;
  status?: string | number;
  count_date?: string;
  period_month?: string;
  note?: string | null;
  total_items?: string | number;
  counted_items?: string | number;
  total_loss_value?: string | number;
  total_shortage_value?: string | number;
  total_overage_value?: string | number;
};

function mapCount(row: RawCount): StockCount {
  return {
    id: str(row.id),
    reference: row.reference ?? `#${row.id ?? ''}`,
    warehouseId: str(row.warehouse_id),
    warehouseName: row.warehouse?.warehouse_name ?? row.warehouse?.name ?? '',
    branchId: str(row.branch_id),
    branchName: row.branch?.branch_name ?? row.branch?.name ?? '',
    status: mapStatus(row.status),
    countDate: row.count_date ?? '',
    periodMonth: row.period_month ?? '',
    note: row.note ?? '',
    totalItems: num(row.total_items),
    countedItems: num(row.counted_items),
    lossValue: num(row.total_loss_value),
    shortageValue: num(row.total_shortage_value),
    overageValue: num(row.total_overage_value),
  };
}

function mapTotals(row: RawCount): StockCountTotals {
  return {
    totalItems: num(row.total_items),
    countedItems: num(row.counted_items),
    lossValue: num(row.total_loss_value),
    shortageValue: num(row.total_shortage_value),
    overageValue: num(row.total_overage_value),
  };
}

type RawCountPage =
  | { current_page?: number; last_page?: number; total?: number; data?: RawCount[] }
  | RawCount[];

export type StockCountPage = {
  items: StockCount[];
  page: number;
  lastPage: number;
  total: number;
};

function mapCountPage(raw: RawCountPage): StockCountPage {
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  return {
    items: list.map(mapCount),
    page: Array.isArray(raw) ? 1 : (raw.current_page ?? 1),
    lastPage: Array.isArray(raw) ? 1 : (raw.last_page ?? 1),
    total: Array.isArray(raw) ? list.length : (raw.total ?? list.length),
  };
}

// ---- Line items ----

type RawItem = {
  detail_id?: number | string;
  id?: number | string;
  item_id?: number | string;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  system_qty?: string | number;
  snapshot_qty?: string | number;
  expected_qty?: string | number;
  counted_qty?: string | number | null;
  reason?: string | null;
  category_id?: number | string;
  sub_category_id?: number | string;
  main_category_id?: number | string;
  category_name?: string;
  variant?: RawVariantRef | null;
  variants?: RawVariant[] | null;
  category?: string | { id?: number | string; category_name?: string; name?: string } | null;
  sub_category?: { id?: number | string; category_name?: string; name?: string } | null;
  status?: string | number;
  completed?: boolean | string | number;
  is_completed?: boolean | string | number;
  completed_at?: string | null;
};

/** Line-level lock flag — the backend shape is unconfirmed, so accept the usual spellings. */
function mapItemCompleted(row: RawItem): boolean {
  if (row.is_completed != null) return Boolean(num(row.is_completed as string | number));
  if (row.completed != null) return Boolean(num(row.completed as string | number));
  if (row.completed_at) return true;
  return mapStatus(row.status) === 'completed';
}

type RawVariant = {
  variant_item_id?: number | string | null;
  item_code?: string | null;
  item_name?: string | null;
  sku?: string | null;
  spec?: string | null;
  color_name?: string | null;
};

type RawVariantRef = {
  parent_item_id?: number | string | null;
  sku?: string | null;
  spec?: string | null;
  color_name?: string | null;
};

/** A short label for a variant, e.g. "Black · 52mm". */
export function variantLabel(v: { colorName: string; spec: string; sku: string }): string {
  return [v.colorName, v.spec, v.sku].map((p) => p.trim()).filter(Boolean).join(' · ');
}

/** The category field's spelling varies by endpoint; accept the usual ones. */
function mapItemCategory(row: RawItem): { id: string; name: string } {
  const nested = row.sub_category ?? (typeof row.category === 'object' ? row.category : null);
  const id = row.sub_category_id ?? row.category_id ?? nested?.id;
  const name =
    row.category_name ??
    nested?.category_name ??
    nested?.name ??
    (typeof row.category === 'string' ? row.category : '');
  return { id: str(id), name: name ?? '' };
}

function mapItem(row: RawItem): StockCountItem {
  const counted = row.counted_qty;
  const code = (row.item_code ?? '').trim();
  const category = mapItemCategory(row);
  const variantOf = row.variant
    ? {
        parentItemId: str(row.variant.parent_item_id),
        sku: str(row.variant.sku),
        spec: str(row.variant.spec),
        colorName: str(row.variant.color_name),
      }
    : null;
  return {
    detailId: str(row.detail_id ?? row.id),
    itemId: str(row.item_id),
    itemCode: code,
    itemName: (row.item_name ?? '').trim() || code,
    image: row.image ?? '',
    systemQty: num(row.system_qty ?? row.snapshot_qty ?? row.expected_qty),
    countedQty: counted == null || counted === '' ? null : num(counted),
    reason: row.reason ?? '',
    categoryId: category.id,
    categoryName: category.name,
    mainCategoryId: str(row.main_category_id),
    variantOf,
    variants: (row.variants ?? []).map((v) => ({
      variantItemId: str(v.variant_item_id),
      itemCode: str(v.item_code),
      itemName: str(v.item_name),
      sku: str(v.sku),
      spec: str(v.spec),
      colorName: str(v.color_name),
    })),
    completed: mapItemCompleted(row),
  };
}

/** Per-category (or whole-count) progress, derived from the line items. */
export type StockCountProgress = {
  total: number;
  counted: number;
  /** Lines already finalized. */
  completed: number;
  /** Counted lines that differ from the system quantity. */
  discrepancies: number;
};

export const EMPTY_PROGRESS: StockCountProgress = {
  total: 0,
  counted: 0,
  completed: 0,
  discrepancies: 0,
};

export function addProgress(a: StockCountProgress, b: StockCountProgress): StockCountProgress {
  return {
    total: a.total + b.total,
    counted: a.counted + b.counted,
    completed: a.completed + b.completed,
    discrepancies: a.discrepancies + b.discrepancies,
  };
}

export function summarizeStockCountItems(items: StockCountItem[]): StockCountProgress {
  let counted = 0;
  let completed = 0;
  let discrepancies = 0;
  for (const it of items) {
    if (it.countedQty != null) {
      counted += 1;
      if (it.countedQty !== it.systemQty) discrepancies += 1;
    }
    if (it.completed) completed += 1;
  }
  return { total: items.length, counted, completed, discrepancies };
}

type RawItemPage =
  | { current_page?: number; last_page?: number; total?: number; data?: RawItem[] }
  | RawItem[];

export type StockCountItemPage = {
  items: StockCountItem[];
  page: number;
  lastPage: number;
  total: number;
};

function mapItemPage(raw: RawItemPage): StockCountItemPage {
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  return {
    items: list.map(mapItem),
    page: Array.isArray(raw) ? 1 : (raw.current_page ?? 1),
    lastPage: Array.isArray(raw) ? 1 : (raw.last_page ?? 1),
    total: Array.isArray(raw) ? list.length : (raw.total ?? list.length),
  };
}

// ---- Endpoints ----

export type StartStockCountBody = {
  branchId: string;
  warehouseId: string;
  countDate?: string;
  note?: string;
  inStockOnly?: boolean;
};

type WrappedCount = { stock_count?: RawCount; data?: RawCount } & RawCount;

const unwrapCount = (data: WrappedCount): RawCount => data.stock_count ?? data.data ?? data;

/** POST /stock-counts — start a count (snapshots warehouse items). */
export async function startStockCount(body: StartStockCountBody): Promise<StockCount> {
  const { data } = await api.post<WrappedCount>('/stock-counts', {
    branch_id: body.branchId,
    warehouse_id: body.warehouseId,
    count_date: body.countDate || undefined,
    note: body.note || undefined,
    in_stock_only: body.inStockOnly ? 1 : undefined,
  });
  return mapCount(unwrapCount(data));
}

export type StockCountListQuery = {
  page?: number;
  branchId?: string;
  warehouseId?: string;
  status?: StockCountStatus | 'all';
  month?: string; // YYYY-MM
  dateFrom?: string;
  dateTo?: string;
};

/** GET /stock-counts — history list. */
export async function fetchStockCounts(query: StockCountListQuery): Promise<StockCountPage> {
  const { data } = await api.get<RawCountPage>('/stock-counts', {
    params: {
      page: query.page ?? 1,
      branch_id: query.branchId || undefined,
      warehouse_id: query.warehouseId || undefined,
      // UI "open" maps to the backend "draft" status.
      status:
        query.status === 'completed'
          ? 'completed'
          : query.status === 'open'
            ? 'draft'
            : undefined,
      month: query.month || undefined,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
    },
  });
  return mapCountPage(data);
}

/** GET /stock-counts/{id} — header + totals (totals are flat on the row). */
export async function fetchStockCount(id: string): Promise<StockCountDetail> {
  const { data } = await api.get<WrappedCount>(`/stock-counts/${id}`);
  const row = unwrapCount(data);
  return { ...mapCount(row), totals: mapTotals(row) };
}

export type StockCountItemQuery = {
  id: string;
  page?: number;
  search?: string;
  onlyDiscrepancy?: boolean;
  /** Main category id to filter by (empty/undefined = all categories). */
  categoryId?: string;
  /** Page size. Pass a large value to load all items in one request. */
  perPage?: number;
};

/** GET /stock-counts/{id}/items — line items. */
export async function fetchStockCountItems({
  id,
  page = 1,
  search = '',
  onlyDiscrepancy,
  categoryId,
  perPage,
}: StockCountItemQuery): Promise<StockCountItemPage> {
  const { data } = await api.get<RawItemPage>(`/stock-counts/${id}/items`, {
    params: {
      page,
      per_page: perPage,
      search: search.trim() || undefined,
      only: onlyDiscrepancy ? 'discrepancy' : undefined,
      category_id: categoryId || undefined,
    },
  });
  return mapItemPage(data);
}

export type SubmitCountLine = { detail_id: string | number; counted_qty: number; reason?: string };

/** POST /stock-counts/{id}/items — submit counted quantities + reasons. */
export async function submitStockCountItems(
  id: string,
  items: SubmitCountLine[],
): Promise<unknown> {
  const { data } = await api.post(`/stock-counts/${id}/items`, { items });
  return data;
}

/**
 * POST /stock-counts/{id}/complete — finalize lines (locks further edits).
 *
 * Pass `categoryId` (a main or sub category) to sign off just that category and
 * leave the rest of the count open. The count itself flips to `completed` only
 * once no line is left open.
 */
export async function completeStockCount(id: string, categoryId?: string): Promise<unknown> {
  const body = categoryId ? { category_id: categoryId } : undefined;
  const { data } = await api.post(`/stock-counts/${id}/complete`, body);
  return data;
}

/** POST /stock-counts/{id}/reopen — send a completed count back to draft so it can be edited. */
export async function reopenStockCount(id: string): Promise<unknown> {
  const { data } = await api.post(`/stock-counts/${id}/reopen`);
  return data;
}

// ---- Loss summary ----

export type LossSummaryRow = {
  branchId: string;
  branchName: string;
  sessions: number;
  /** Value of missing stock (counted < system). */
  shortageValue: number;
  /** Value of surplus stock (counted > system). */
  overageValue: number;
  /** overage − shortage (negative = net loss). */
  netValue: number;
};

type RawLoss = {
  branch_id?: number | string;
  branch_name?: string;
  count_sessions?: string | number;
  total_loss_value?: string | number;
  total_overage_value?: string | number;
  net_value?: string | number;
};

type RawLossResp = { data?: RawLoss[] } | RawLoss[];

function mapLoss(r: RawLoss): LossSummaryRow {
  const shortageValue = num(r.total_loss_value);
  const overageValue = num(r.total_overage_value);
  return {
    branchId: str(r.branch_id),
    branchName: r.branch_name ?? '',
    sessions: num(r.count_sessions),
    shortageValue,
    overageValue,
    netValue: r.net_value != null ? num(r.net_value) : overageValue - shortageValue,
  };
}

/** GET /stock-counts/loss-summary — per-branch loss report. */
export async function fetchLossSummary({
  month,
  branchId,
}: {
  month?: string;
  branchId?: string;
} = {}): Promise<LossSummaryRow[]> {
  const { data } = await api.get<RawLossResp>('/stock-counts/loss-summary', {
    params: { month: month || undefined, branch_id: branchId || undefined },
  });
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list.map(mapLoss);
}
