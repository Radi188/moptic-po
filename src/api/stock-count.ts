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
};

function mapItem(row: RawItem): StockCountItem {
  const counted = row.counted_qty;
  const code = (row.item_code ?? '').trim();
  return {
    detailId: str(row.detail_id ?? row.id),
    itemId: str(row.item_id),
    itemCode: code,
    itemName: (row.item_name ?? '').trim() || code,
    image: row.image ?? '',
    systemQty: num(row.system_qty ?? row.snapshot_qty ?? row.expected_qty),
    countedQty: counted == null || counted === '' ? null : num(counted),
    reason: row.reason ?? '',
  };
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
};

/** GET /stock-counts/{id}/items — line items. */
export async function fetchStockCountItems({
  id,
  page = 1,
  search = '',
  onlyDiscrepancy,
}: StockCountItemQuery): Promise<StockCountItemPage> {
  const { data } = await api.get<RawItemPage>(`/stock-counts/${id}/items`, {
    params: {
      page,
      search: search.trim() || undefined,
      only: onlyDiscrepancy ? 'discrepancy' : undefined,
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

/** POST /stock-counts/{id}/complete — finalize (locks edits). */
export async function completeStockCount(id: string): Promise<unknown> {
  const { data } = await api.post(`/stock-counts/${id}/complete`);
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
