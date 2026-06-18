import { api } from "@/api/client";
import { isApiConfigured } from "@/api/config";
import {
  listProducts,
  type InventoryProduct,
  type ProductStatus,
} from "@/data/inventory";

export type InventoryPage = {
  items: InventoryProduct[];
  page: number;
  lastPage: number;
  total: number;
};

type RawItem = {
  id?: number | string;
  item_id?: number | string;
  item_code?: string;
  code?: string;
  item_name?: string;
  name?: string;
  category?: string;
  category_name?: string;
  brand?: string;
  brand_name?: string;
  barcode?: string;
  purchase_cost?: string | number;
  cost?: string | number;
  item_price?: string | number;
  sale_price?: string | number;
  selling_price?: string | number;
  unit_price?: string | number;
  retail_price?: string | number;
  sell_price?: string | number;
  price?: string | number;
  qty?: string | number;
  stock?: string | number;
  quantity?: string | number;
  qty_left?: string | number;
  stock_qty?: string | number;
  available_qty?: string | number;
  current_stock?: string | number;
  on_hand?: string | number;
  total_qty?: string | number;
  alert_qty?: string | number;
  reorder_level?: string | number;
  min_qty?: string | number;
  status?: string | number;
  description?: string | null;
  image?: string | null;
  thumbnail?: string | null;
};

type RawPaginator = {
  current_page?: number;
  last_page?: number;
  total?: number;
  data?: RawItem[];
  // Laravel API resources put the rows under `data` and the page numbers under
  // `meta`, so accept both shapes.
  meta?: { current_page?: number; last_page?: number; total?: number };
};

// The list endpoint can return: a bare array, a paginator, a paginator nested
// under `data` (resource collection), or the rows under `items`/`results`.
type RawPage =
  | RawPaginator
  | RawItem[]
  | { data?: RawPaginator; items?: RawItem[]; results?: RawItem[] };

const num = (v: string | number | undefined) => Number(v ?? 0) || 0;

function toStatus(v: RawItem["status"]): ProductStatus {
  if (v === 0 || v === "0" || v === "inactive" || v === "Inactive")
    return "inactive";
  return "active";
}

function mapItem(row: RawItem): InventoryProduct {
  return {
    id: String(row.item_id ?? row.id ?? ""),
    code: row.item_code ?? row.code ?? "",
    name: row.item_name ?? row.name ?? row.item_code ?? row.code ?? "",
    nameKhmer: "",
    category: row.category ?? row.category_name ?? "",
    brand: row.brand ?? row.brand_name ?? "",
    stockType: "Stock",
    barcode: row.barcode ?? "",
    cost: num(row.purchase_cost ?? row.cost),
    price: num(
      row.item_price ??
        row.sale_price ??
        row.selling_price ??
        row.unit_price ??
        row.retail_price ??
        row.sell_price ??
        row.price,
    ),
    stock: num(
      row.qty ??
        row.stock ??
        row.quantity ??
        row.qty_left ??
        row.stock_qty ??
        row.available_qty ??
        row.current_stock ??
        row.on_hand ??
        row.total_qty,
    ),
    reorderLevel: num(row.alert_qty ?? row.reorder_level ?? row.min_qty),
    status: toStatus(row.status),
    description: row.description ?? "",
    descriptionKhmer: "",
    thumbnail: row.image ?? row.thumbnail ?? "",
    gallery: [],
  };
}

/**
 * Pull the rows + pagination out of whatever envelope the endpoint uses. The
 * `/items` list and `/items/search` endpoints don't wrap their data the same
 * way, which is why the list could come back empty while search worked.
 */
function mapPage(raw: RawPage): InventoryPage {
  if (Array.isArray(raw)) {
    return { items: raw.map(mapItem), page: 1, lastPage: 1, total: raw.length };
  }

  const obj = raw as Record<string, unknown>;
  // Find the actual paginator: it may be the body itself, or nested under `data`.
  const nested = obj.data;
  const paginator: RawPaginator =
    nested && !Array.isArray(nested) && typeof nested === "object"
      ? (nested as RawPaginator)
      : (raw as RawPaginator);

  const list =
    paginator.data ??
    (Array.isArray(nested) ? (nested as RawItem[]) : undefined) ??
    (obj.items as RawItem[] | undefined) ??
    (obj.results as RawItem[] | undefined) ??
    [];

  const meta = paginator.meta ?? paginator;
  return {
    items: list.map(mapItem),
    page: meta.current_page ?? 1,
    lastPage: meta.last_page ?? 1,
    total: meta.total ?? list.length,
  };
}

export type InventoryQuery = {
  page: number;
  search?: string;
  branchId?: string;
};

/** GET /items (or /items/search?q=) — paginated inventory. Falls back to mock. */
export async function fetchInventory({
  page,
  search = "",
  branchId,
}: InventoryQuery): Promise<InventoryPage> {
  if (!isApiConfigured()) {
    const res = listProducts({ page, search, pageSize: 8 });
    return {
      items: res.items,
      page: res.page,
      lastPage: res.totalPages,
      total: res.total,
    };
  }
  const term = search.trim();
  const path = term ? "/items/search" : "/items";
  // Stock on hand is per-branch, so scope the list to the active branch.
  // Cap the page size: without it the backend may try to build the whole
  // catalog (with per-branch stock joins) in one request and time out (504).
  const params: Record<string, string | number> = { page, per_page: 20 };
  if (term) params.q = term;
  if (branchId) params.branch_id = branchId;
  const { data } = await api.get<RawPage>(path, { params });

  const result = mapPage(data);

  // The list ('/items') and search ('/items/search') endpoints wrap their data
  // differently; this surfaces the raw shape so an empty list is easy to debug
  // against the backend (which envelope, how many rows, top-level keys).
  if (__DEV__) {
    const top = Array.isArray(data)
      ? "[array]"
      : Object.keys(data ?? {}).join(", ");
    console.log(
      `[inventory] GET ${path}`,
      JSON.stringify(params),
      `→ keys: {${top}} · mapped ${result.items.length} item(s) · total=${result.total}`,
    );
    if (result.items.length === 0) {
      console.log(
        "[inventory] empty result, raw body:",
        JSON.stringify(data)?.slice(0, 800),
      );
    }
  }

  return result;
}
