import { api } from "@/api/client";

export type AdjustType = "increase" | "decrease";

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

/** GET /stock-adjustments/{id} — single adjustment detail. */
export async function fetchStockAdjustment(
  id: string,
): Promise<StockAdjustment> {
  const { data } = await api.get<RawAdjustment | { data?: RawAdjustment }>(
    `/stock-adjustments/${id}`,
  );
  const row =
    (data as { data?: RawAdjustment }).data ?? (data as RawAdjustment);
  return mapAdjustment(row);
}

/** Body for POST /stock-adjustments (relative to /api/v1/staff). */
export type CreateStockAdjustmentBody = {
  warehouse_id: number;
  branch_login_id: number;
  item_id: number;
  adjust_qty: number;
  adjust_type: AdjustType;
  description?: string;
  /** Only set for unique (serialized) items; null otherwise. */
  stock_unique_id?: number | null;
};

/** POST /stock-adjustments. */
export async function createStockAdjustment(
  body: CreateStockAdjustmentBody,
): Promise<unknown> {
  const { data } = await api.post("/stock-adjustments", body);
  return data;
}
