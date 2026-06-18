import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import { PRODUCTS } from '@/data/purchase-orders';

export type ApiItem = {
  id: string;
  code: string;
  name: string;
  cost: number;
  image?: string;
};

export type ItemsPage = {
  items: ApiItem[];
  page: number;
  lastPage: number;
};

type RawItem = {
  id?: number | string;
  item_id?: number | string;
  item_code?: string;
  code?: string;
  item_name?: string;
  name?: string;
  purchase_cost?: string | number;
  cost?: string | number;
  sale_price?: string | number;
  image?: string | null;
  thumbnail?: string | null;
};

type RawPaginator = {
  current_page?: number;
  last_page?: number;
  data?: RawItem[];
  meta?: { current_page?: number; last_page?: number };
};

// The list ('/items') and search ('/items/search') endpoints wrap their rows
// differently, so accept a bare array, a paginator, a paginator nested under
// `data` (resource collection), or rows under `items`/`results`.
type RawPage =
  | RawPaginator
  | RawItem[]
  | { data?: RawPaginator; items?: RawItem[]; results?: RawItem[] };

function mapItem(row: RawItem): ApiItem {
  // The purchase-order endpoint references products by `item_id`; fall back to `id`.
  return {
    id: String(row.item_id ?? row.id ?? ''),
    code: row.item_code ?? row.code ?? '',
    name: row.item_name ?? row.name ?? row.item_code ?? row.code ?? '',
    cost: Number(row.purchase_cost ?? row.cost ?? row.sale_price ?? 0) || 0,
    image: row.image ?? row.thumbnail ?? undefined,
  };
}

function mapPage(raw: RawPage): ItemsPage {
  if (Array.isArray(raw)) {
    return { items: raw.map(mapItem), page: 1, lastPage: 1 };
  }

  const obj = raw as Record<string, unknown>;
  const nested = obj.data;
  const paginator: RawPaginator =
    nested && !Array.isArray(nested) && typeof nested === 'object'
      ? (nested as RawPaginator)
      : (raw as RawPaginator);

  const list =
    paginator.data ??
    (Array.isArray(nested) ? (nested as RawItem[]) : undefined) ??
    (obj.items as RawItem[] | undefined) ??
    (obj.results as RawItem[] | undefined) ??
    [];

  const meta = paginator.meta ?? paginator;
  return { items: list.map(mapItem), page: meta.current_page ?? 1, lastPage: meta.last_page ?? 1 };
}

// Mock catalog used when no API URL is configured.
const MOCK_ITEMS: ApiItem[] = PRODUCTS.map((p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  cost: p.cost,
}));

/** GET /items?page= (paginated). */
export async function fetchItems(page = 1): Promise<ItemsPage> {
  if (!isApiConfigured()) return { items: MOCK_ITEMS, page: 1, lastPage: 1 };
  const { data } = await api.get<RawPage>('/items', { params: { page } });
  const result = mapPage(data);
  if (__DEV__) {
    const top = Array.isArray(data) ? '[array]' : Object.keys(data ?? {}).join(', ');
    console.log(`[items] GET /items page=${page} → keys: {${top}} · mapped ${result.items.length}`);
    if (result.items.length === 0) {
      console.log('[items] empty result, raw body:', JSON.stringify(data)?.slice(0, 800));
    }
  }
  return result;
}

/** GET /items/search?q=&page= (paginated). */
export async function searchItems(q: string, page = 1): Promise<ItemsPage> {
  if (!isApiConfigured()) {
    const term = q.trim().toLowerCase();
    return {
      items: MOCK_ITEMS.filter(
        (i) => i.code.toLowerCase().includes(term) || i.name.toLowerCase().includes(term),
      ),
      page: 1,
      lastPage: 1,
    };
  }
  const { data } = await api.get<RawPage>('/items/search', { params: { q, page } });
  return mapPage(data);
}
