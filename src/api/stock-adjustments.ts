import { api } from "@/api/client";

/** Whether an adjustment adds to or removes from stock (used for display). */
export type AdjustType = "increase" | "decrease";

/**
 * Category codes sent to the backend as `adjust_type`. Each code implies a
 * direction (see INCREASE_REASONS / DECREASE_REASONS) so the UI can show +/-.
 */
export type AdjustReason =
  | "found"
  | "customer_return"
  | "supplier_bonus"
  | "correction_in"
  | "loss"
  | "expired"
  | "damaged"
  | "theft"
  | "sample"
  | "correction_out";

export const INCREASE_REASONS: AdjustReason[] = [
  "found",
  "customer_return",
  "supplier_bonus",
  "correction_in",
];

export const DECREASE_REASONS: AdjustReason[] = [
  "loss",
  "expired",
  "damaged",
  "theft",
  "sample",
  "correction_out",
];

/** Direction implied by a reason code; unknown codes are treated as a decrease. */
export function reasonDirection(reason: string): AdjustType {
  return (INCREASE_REASONS as string[]).includes(reason)
    ? "increase"
    : "decrease";
}

export type StockAdjustment = {
  id: string;
  reference: string;
  itemName: string;
  itemCode: string;
  image: string;
  warehouseId: string;
  /** Warehouse name when the endpoint includes it; otherwise empty. */
  warehouse: string;
  adjustType: AdjustType;
  qty: number;
  cost: number;
  totalCost: number;
  description: string;
  user: string;
  /** ISO date string. */
  date: string;
};

export type StockAdjustmentPage = {
  items: StockAdjustment[];
  page: number;
  lastPage: number;
  total: number;
};

type ApiWarehouseRef = { warehouse_name?: string; name?: string };
type ApiUserRef = { name?: string; full_name?: string };

type RawAdjustment = {
  id?: number | string;
  transaction_ref?: string;
  warehouse_id?: number | string;
  warehouse?: ApiWarehouseRef | null;
  item_id?: number | string;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  is_unique?: string | number;
  item_stock_unique_id?: number | string | null;
  adjust_qty?: string | number;
  adjust_cost?: string | number;
  total_cost?: string | number;
  type?: string;
  // "I"/"in" = inbound (increase), "O"/"out" = outbound (decrease).
  event?: string;
  adjust_type?: string;
  description?: string | null;
  transaction_date?: string;
  user_created?: string | number | null;
  user?: ApiUserRef | null;
};

type RawPage =
  | {
      current_page?: number;
      last_page?: number;
      total?: number;
      data?: RawAdjustment[];
    }
  | RawAdjustment[];

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;
const toIso = (s: string | undefined) =>
  !s ? "" : s.includes("T") ? s : s.replace(" ", "T");

function mapAdjustType(row: RawAdjustment): AdjustType {
  const t = String(row.adjust_type ?? "").toLowerCase();
  if (t === "increase") return "increase";
  if (t === "decrease") return "decrease";
  const ev = String(row.event ?? "").toLowerCase();
  if (ev === "i" || ev.startsWith("in")) return "increase";
  // event "O" (outbound) reduces stock.
  return "decrease";
}

function mapAdjustment(row: RawAdjustment): StockAdjustment {
  return {
    id: String(row.id ?? ""),
    reference: row.transaction_ref ?? `#${row.id ?? ""}`,
    itemName: row.item_name ?? row.item_code ?? "",
    itemCode: row.item_code ?? "",
    image: row.image ?? "",
    warehouseId: String(row.warehouse_id ?? ""),
    warehouse: row.warehouse?.warehouse_name ?? row.warehouse?.name ?? "",
    adjustType: mapAdjustType(row),
    qty: num(row.adjust_qty),
    cost: num(row.adjust_cost),
    totalCost: num(row.total_cost),
    description: row.description ?? "",
    user: row.user?.full_name ?? row.user?.name ?? "",
    date: toIso(row.transaction_date),
  };
}

function mapPage(raw: RawPage): StockAdjustmentPage {
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  return {
    items: list.map(mapAdjustment),
    page: Array.isArray(raw) ? 1 : (raw.current_page ?? 1),
    lastPage: Array.isArray(raw) ? 1 : (raw.last_page ?? 1),
    total: Array.isArray(raw) ? list.length : (raw.total ?? list.length),
  };
}

export type StockAdjustmentQuery = {
  page: number;
  search?: string;
  branchId?: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

const PER_PAGE = 20;

/** GET /stock-adjustments — paginated adjustment history (scoped to the branch). */
export async function fetchStockAdjustments({
  page,
  search = "",
  branchId,
  dateFrom,
  dateTo,
}: StockAdjustmentQuery): Promise<StockAdjustmentPage> {
  const { data } = await api.get<RawPage>("/stock-adjustments", {
    params: {
      page,
      per_page: PER_PAGE,
      search: search.trim() || undefined,
      branch_login_id: branchId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
  });
  return mapPage(data);
}

// ---- Grouped detail (one transaction, many items) ----

export type StockAdjustmentItem = {
  itemId: string;
  itemName: string;
  itemCode: string;
  image: string;
  /** Raw category code (e.g. "loss", "expired"). */
  reason: string;
  /** Direction implied by the reason, for +/- display. */
  adjustType: AdjustType;
  qty: number;
  cost: number;
  totalCost: number;
  description: string;
};

export type StockAdjustmentDetail = {
  id: string;
  reference: string;
  warehouseId: string;
  warehouse: string;
  branchLoginId: string;
  user: string;
  /** ISO date string. */
  date: string;
  items: StockAdjustmentItem[];
};

type RawDetail = RawAdjustment & {
  branch_login_id?: number | string;
  items?: RawAdjustment[];
};

function mapDetailItem(row: RawAdjustment): StockAdjustmentItem {
  const reason = String(row.adjust_type ?? "");
  return {
    itemId: String(row.item_id ?? ""),
    itemName: row.item_name ?? row.item_code ?? "",
    itemCode: row.item_code ?? "",
    image: row.image ?? "",
    reason,
    // Prefer the reason's direction; fall back to the event-based mapping when
    // the code is unrecognised.
    adjustType:
      (INCREASE_REASONS as string[]).includes(reason) ||
      (DECREASE_REASONS as string[]).includes(reason)
        ? reasonDirection(reason)
        : mapAdjustType(row),
    qty: num(row.adjust_qty),
    cost: num(row.adjust_cost),
    totalCost: num(row.total_cost),
    description: row.description ?? "",
  };
}

function mapDetail(row: RawDetail): StockAdjustmentDetail {
  // The backend groups items under `items`; tolerate a flat single-item row too.
  const rawItems = row.items?.length ? row.items : [row];
  return {
    id: String(row.id ?? ""),
    reference: row.transaction_ref ?? `#${row.id ?? ""}`,
    warehouseId: String(row.warehouse_id ?? ""),
    warehouse: row.warehouse?.warehouse_name ?? row.warehouse?.name ?? "",
    branchLoginId: String(row.branch_login_id ?? ""),
    user: row.user?.full_name ?? row.user?.name ?? "",
    date: toIso(row.transaction_date),
    items: rawItems.map(mapDetailItem),
  };
}

/** GET /stock-adjustments/{id} — one transaction with its items. */
export async function fetchStockAdjustment(
  id: string,
): Promise<StockAdjustmentDetail> {
  const { data } = await api.get<RawDetail | { data?: RawDetail }>(
    `/stock-adjustments/${id}`,
  );
  const row = (data as { data?: RawDetail }).data ?? (data as RawDetail);
  return mapDetail(row);
}

// ---- Create (batched, one transaction) ----

/** A single line inside a create request's `items` array. */
export type AdjustItemInput = {
  item_id: number;
  adjust_qty: number;
  adjust_type: AdjustReason;
  /** Optional free-text note; omit when empty. */
  description?: string;
};

/** Body for POST /stock-adjustments (relative to /api/v1/staff). */
export type CreateStockAdjustmentBody = {
  warehouse_id: number;
  branch_login_id: number;
  items: AdjustItemInput[];
};

/** POST /stock-adjustments — creates every item in one transaction. */
export async function createStockAdjustment(
  body: CreateStockAdjustmentBody,
): Promise<unknown> {
  const { data } = await api.post("/stock-adjustments", body);
  return data;
}
