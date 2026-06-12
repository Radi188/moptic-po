import { api } from '@/api/client';

export type StockOnHandItem = {
  id: string;
  code: string;
  name: string;
  image: string;
  category: string;
  categoryId: string;
  warehouseId: string;
  qty: number;
  cost: number;
  price: number;
  value: number;
};

export type StockOnHandPage = {
  items: StockOnHandItem[];
  page: number;
  lastPage: number;
  total: number;
};

export type StockOnHandSummary = {
  totalItems: number;
  totalQty: number;
  stockValue: number;
  retailValue: number;
  lowStock: number;
  outOfStock: number;
};

// Field names aren't fully confirmed yet, so read defensively (same approach
// used by the inventory/transfers mappers).
type RawItem = {
  id?: number | string;
  item_id?: number | string;
  item_code?: string;
  code?: string;
  item_name?: string;
  name?: string;
  image?: string | null;
  thumbnail?: string | null;
  category?: string;
  category_name?: string;
  category_id?: number | string;
  warehouse_id?: number | string;
  item_qty?: string | number;
  qty?: string | number;
  qty_on_hand?: string | number;
  stock?: string | number;
  quantity?: string | number;
  available_qty?: string | number;
  current_stock?: string | number;
  purchase_cost?: string | number;
  cost?: string | number;
  sale_price?: string | number;
  selling_price?: string | number;
  price?: string | number;
  stock_value?: string | number;
  total_cost?: string | number;
};

type RawPage =
  | { current_page?: number; last_page?: number; total?: number; data?: RawItem[] }
  | RawItem[];

type RawSummary = {
  total_items?: string | number;
  total_products?: string | number;
  items?: string | number;
  total_qty?: string | number;
  total_units?: string | number;
  total_quantity?: string | number;
  stock_value?: string | number;
  total_value?: string | number;
  cost_value?: string | number;
  retail_value?: string | number;
  sale_value?: string | number;
  low_stock?: string | number;
  low_stock_count?: string | number;
  out_of_stock?: string | number;
  out_of_stock_count?: string | number;
  // Some APIs nest the numbers under `summary`/`totals`/`data`.
  summary?: RawSummary;
  totals?: RawSummary;
  data?: RawSummary;
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;

function mapItem(row: RawItem): StockOnHandItem {
  const qty = num(
    row.item_qty ??
      row.qty_on_hand ??
      row.qty ??
      row.stock ??
      row.quantity ??
      row.available_qty ??
      row.current_stock,
  );
  const cost = num(row.purchase_cost ?? row.cost);
  return {
    id: String(row.item_id ?? row.id ?? ''),
    code: row.item_code ?? row.code ?? '',
    name: row.item_name ?? row.name ?? row.item_code ?? row.code ?? '',
    image: row.image ?? row.thumbnail ?? '',
    category: row.category_name ?? row.category ?? '',
    categoryId: String(row.category_id ?? ''),
    warehouseId: String(row.warehouse_id ?? ''),
    qty,
    cost,
    price: num(row.sale_price ?? row.selling_price ?? row.price),
    value: num(row.stock_value ?? row.total_cost) || cost * qty,
  };
}

function mapPage(raw: RawPage): StockOnHandPage {
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  return {
    items: list.map(mapItem),
    page: Array.isArray(raw) ? 1 : (raw.current_page ?? 1),
    lastPage: Array.isArray(raw) ? 1 : (raw.last_page ?? 1),
    total: Array.isArray(raw) ? list.length : (raw.total ?? list.length),
  };
}

function mapSummary(raw: RawSummary): StockOnHandSummary {
  const s = raw.summary ?? raw.totals ?? raw.data ?? raw;
  return {
    totalItems: num(s.total_items ?? s.total_products ?? s.items),
    totalQty: num(s.total_qty ?? s.total_units ?? s.total_quantity),
    stockValue: num(s.stock_value ?? s.total_value ?? s.cost_value),
    retailValue: num(s.retail_value ?? s.sale_value),
    lowStock: num(s.low_stock ?? s.low_stock_count),
    outOfStock: num(s.out_of_stock ?? s.out_of_stock_count),
  };
}

export type StockOnHandQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  warehouseId?: string;
  categoryId?: string;
  branchId?: string;
  /** Only items with stock on hand (in_stock=1). */
  inStock?: boolean;
};

/** GET /stock-on-hand — paginated stock-on-hand list. */
export async function fetchStockOnHand({
  page = 1,
  perPage,
  search = '',
  warehouseId,
  categoryId,
  branchId,
  inStock,
}: StockOnHandQuery): Promise<StockOnHandPage> {
  const { data } = await api.get<RawPage>('/stock-on-hand', {
    params: {
      page,
      per_page: perPage || undefined,
      search: search.trim() || undefined,
      warehouse_id: warehouseId || undefined,
      category_id: categoryId || undefined,
      branch_login_id: branchId || undefined,
      in_stock: inStock ? 1 : undefined,
    },
  });
  return mapPage(data);
}

/**
 * Builds an item_id → on-hand qty map for a warehouse (in-stock items only).
 * Fetches page 1, then the remaining pages in parallel (capped for safety).
 */
export async function fetchWarehouseStockMap(
  warehouseId: string,
): Promise<Record<string, number>> {
  const PER_PAGE = 500;
  const MAX_PAGES = 40;
  const map: Record<string, number> = {};
  const add = (items: StockOnHandItem[]) => {
    for (const it of items) if (it.id) map[it.id] = it.qty;
  };

  const first = await fetchStockOnHand({ page: 1, perPage: PER_PAGE, warehouseId, inStock: true });
  add(first.items);

  const lastPage = Math.min(first.lastPage, MAX_PAGES);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetchStockOnHand({ page: i + 2, perPage: PER_PAGE, warehouseId, inStock: true }),
      ),
    );
    for (const pg of rest) add(pg.items);
  }
  return map;
}

/** GET /stock-on-hand/summary — totals for the stat cards. */
export async function fetchStockOnHandSummary({
  warehouseId,
  branchId,
}: {
  warehouseId?: string;
  branchId?: string;
} = {}): Promise<StockOnHandSummary> {
  const { data } = await api.get<RawSummary>('/stock-on-hand/summary', {
    params: {
      warehouse_id: warehouseId || undefined,
      branch_login_id: branchId || undefined,
    },
  });
  return mapSummary(data);
}
