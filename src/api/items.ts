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

type RawPage = { current_page?: number; last_page?: number; data?: RawItem[] } | RawItem[];

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
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  const page = Array.isArray(raw) ? 1 : (raw.current_page ?? 1);
  const lastPage = Array.isArray(raw) ? 1 : (raw.last_page ?? 1);
  return { items: list.map(mapItem), page, lastPage };
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
  return mapPage(data);
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
