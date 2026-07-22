import { api, ApiError } from "@/api/client";
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
  category_id?: number | string;
  stock_type?: string;
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
    categoryId: row.category_id != null ? String(row.category_id) : undefined,
    brand: row.brand ?? row.brand_name ?? "",
    // Backend stock_type is a single letter: 'N' = Not Stock, else Stock.
    stockType: row.stock_type === "N" ? "Not Stock" : "Stock",
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
};

/** GET /items (or /items/search?q=) — paginated inventory. Falls back to mock. */
export async function fetchInventory({
  page,
  search = "",
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
  // Always use the inventory index endpoint ('/items'), which supports a
  // `search` param and returns EVERY matching item (it left-joins stock; no
  // status/stock_type filter). The separate '/items/search' route is the
  // purchasing item-picker — it filters status=1 & stock_type='S' and returns a
  // reduced shape, so it hides Not-Stock and newly created items.
  // Cap the page size so the backend doesn't build the whole catalog at once.
  const params: Record<string, string | number> = { page, per_page: 20 };
  if (term) params.search = term;
  const { data } = await api.get<RawPage>("/items", { params });

  const result = mapPage(data);

  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Number of rows requested per export page. Kept large so the full catalog
 * comes back in one (or very few) requests instead of dozens of small pages —
 * many small requests trip the backend rate limiter ("Too Many Attempts", 429).
 */
const EXPORT_PAGE_SIZE = 1000;

/** Fetch one export page, retrying with backoff when the server throttles. */
async function fetchExportPage(
  page: number,
  perPage: number,
  term: string,
): Promise<InventoryPage> {
  const params: Record<string, string | number> = { page, per_page: perPage };
  if (term) params.search = term;
  for (let attempt = 0; ; attempt++) {
    try {
      const { data } = await api.get<RawPage>("/items", { params });
      return mapPage(data);
    } catch (e) {
      // Back off and retry on rate-limit / temporary-unavailable responses.
      const status = e instanceof ApiError ? e.status : 0;
      if ((status === 429 || status === 503) && attempt < 3) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Fetch EVERY matching inventory row for the export flow. Uses a large page
 * size so it usually completes in a single request; if the backend still
 * paginates, it walks the remaining pages gently (paced + throttle-aware) so it
 * never fires the burst of small requests that trips the rate limiter.
 */
export async function fetchAllInventory({
  search = "",
  pageSize = EXPORT_PAGE_SIZE,
  onProgress,
}: {
  search?: string;
  pageSize?: number;
  onProgress?: (loaded: number, total: number) => void;
} = {}): Promise<InventoryProduct[]> {
  if (!isApiConfigured()) {
    return listProducts({ page: 1, search, pageSize: 100000 }).items;
  }
  const term = search.trim();
  const all: InventoryProduct[] = [];
  const MAX_PAGES = 50;
  let page = 1;
  let lastPage = 1;
  do {
    const result = await fetchExportPage(page, pageSize, term);
    all.push(...result.items);
    lastPage = result.lastPage;
    onProgress?.(all.length, result.total || all.length);
    if (result.items.length === 0) break;
    page += 1;
    // Pace successive pages to stay under the rate limiter's window.
    if (page <= lastPage) await sleep(300);
  } while (page <= lastPage && page <= MAX_PAGES);
  return all;
}
