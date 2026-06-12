import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import { listProducts, type InventoryProduct, type ProductStatus } from '@/data/inventory';

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

type RawPage =
  | { current_page?: number; last_page?: number; total?: number; data?: RawItem[] }
  | RawItem[];

const num = (v: string | number | undefined) => Number(v ?? 0) || 0;

function toStatus(v: RawItem['status']): ProductStatus {
  if (v === 0 || v === '0' || v === 'inactive' || v === 'Inactive') return 'inactive';
  return 'active';
}

function mapItem(row: RawItem): InventoryProduct {
  return {
    id: String(row.item_id ?? row.id ?? ''),
    code: row.item_code ?? row.code ?? '',
    name: row.item_name ?? row.name ?? row.item_code ?? row.code ?? '',
    nameKhmer: '',
    category: row.category ?? row.category_name ?? '',
    brand: row.brand ?? row.brand_name ?? '',
    stockType: 'Stock',
    barcode: row.barcode ?? '',
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
    description: row.description ?? '',
    descriptionKhmer: '',
    thumbnail: row.image ?? row.thumbnail ?? '',
    gallery: [],
  };
}

function mapPage(raw: RawPage): InventoryPage {
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  const page = Array.isArray(raw) ? 1 : (raw.current_page ?? 1);
  const lastPage = Array.isArray(raw) ? 1 : (raw.last_page ?? 1);
  const total = Array.isArray(raw) ? list.length : (raw.total ?? list.length);
  return { items: list.map(mapItem), page, lastPage, total };
}

export type InventoryQuery = { page: number; search?: string; branchId?: string };

/** GET /items (or /items/search?q=) — paginated inventory. Falls back to mock. */
export async function fetchInventory({
  page,
  search = '',
  branchId,
}: InventoryQuery): Promise<InventoryPage> {
  if (!isApiConfigured()) {
    const res = listProducts({ page, search, pageSize: 8 });
    return { items: res.items, page: res.page, lastPage: res.totalPages, total: res.total };
  }
  const term = search.trim();
  const path = term ? '/items/search' : '/items';
  // Stock on hand is per-branch, so scope the list to the active branch.
  const params: Record<string, string | number> = { page };
  if (term) params.q = term;
  if (branchId) params.branch_id = branchId;
  const { data } = await api.get<RawPage>(path, { params });
  return mapPage(data);
}
