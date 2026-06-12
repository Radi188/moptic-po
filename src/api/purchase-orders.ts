import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import {
  getPurchaseOrder as getLocalPurchaseOrder,
  listPurchaseOrders as listLocalPurchaseOrders,
  VENDORS,
  WAREHOUSES,
  type PurchaseOrder,
  type PurchaseOrderPage,
} from '@/data/purchase-orders';

export type ApiOption = { id: string; name: string };

/** One row of POST /staff/purchase-orders -> items[]. */
export type PurchaseOrderItemBody = {
  item_id: string;
  item_code: string;
  item_name: string;
  cost: number;
  qty: number;
  discount_amount: number;
  is_unique: boolean;
};

/** Body for POST /api/v1/staff/purchase-orders (one-to-one with the form). */
export type CreatePurchaseOrderBody = {
  date: string;
  discount_amount: number;
  vendor_id: string;
  warehouse_id: string;
  /** The branch the user is currently signed in to. */
  branch_login_id: string;
  note: string;
  items: PurchaseOrderItemBody[];
};

function slug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Mock options used when no API base URL is configured. */
const MOCK_VENDORS: ApiOption[] = VENDORS.map((name) => ({ id: slug(name), name }));
const MOCK_WAREHOUSES: ApiOption[] = WAREHOUSES.map((name) => ({ id: slug(name), name }));

type OptionRow = {
  id: number | string;
  name?: string;
  warehouse_name?: string;
  vendor_name?: string;
  title?: string;
};

type ListResponse = { data?: OptionRow[] } & { [key: string]: unknown };

function optionName(row: OptionRow) {
  return row.name ?? row.warehouse_name ?? row.vendor_name ?? row.title ?? '';
}

function normalizeOptions(payload: ListResponse | OptionRow[]): ApiOption[] {
  const list = Array.isArray(payload) ? payload : (payload.data ?? []);
  return list.map((item) => ({ id: String(item.id), name: optionName(item) }));
}

/** GET /vendors (relative to /api/v1/staff) */
export async function getVendors(): Promise<ApiOption[]> {
  if (!isApiConfigured()) return MOCK_VENDORS;
  const { data } = await api.get<ListResponse | OptionRow[]>('/vendors');
  return normalizeOptions(data);
}

/** GET /warehouses/all — list of warehouses for filters/selects. */
export async function getWarehouses(): Promise<ApiOption[]> {
  if (!isApiConfigured()) return MOCK_WAREHOUSES;
  const { data } = await api.get<ListResponse | OptionRow[]>('/warehouses/all');
  return normalizeOptions(data);
}

/** POST /purchase-orders (relative to /api/v1/staff) */
export async function createPurchaseOrder(body: CreatePurchaseOrderBody): Promise<unknown> {
  const { data } = await api.post('/purchase-orders', body);
  return data;
}

// ---- List & detail (GET /purchase-orders, GET /purchase-orders/{id}) ----

type ApiVendor = { id: number; vendor_name: string };

type ApiListItem = {
  id: number;
  purchase_ref: string;
  transaction_date: string;
  amount: string | number;
  discount_amount: string | number;
  grand_total: string | number;
  warehouse_id: string | number;
  vendor: ApiVendor | null;
  purchase_order_details_count: number;
};

type ApiListResponse = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  data: ApiListItem[];
};

type ApiDetailItem = {
  id: number;
  item_id: string | number;
  item_code: string;
  item_name: string;
  image: string | null;
  purchase_cost: string | number;
  purchase_qty: string | number;
  amount: string | number;
  discount_amount: string | number;
  grand_total: string | number;
  is_unique: string | number;
};

type ApiDetail = {
  id: number;
  purchase_ref: string;
  transaction_date: string;
  note: string | null;
  amount: string | number;
  discount_amount: string | number;
  grand_total: string | number;
  warehouse_id: string | number;
  vendor: ApiVendor | null;
  items: ApiDetailItem[];
};

const num = (v: string | number) => Number(v) || 0;
// Treat a bare "YYYY-MM-DD" as local time so the displayed day doesn't shift.
const toIso = (s: string) => (s.includes('T') ? s : `${s}T00:00:00`);

function mapListItem(row: ApiListItem): PurchaseOrder {
  return {
    id: String(row.id),
    reference: row.purchase_ref,
    transactionDate: toIso(row.transaction_date),
    vendor: row.vendor?.vendor_name ?? '',
    warehouse: String(row.warehouse_id),
    amount: num(row.amount),
    discountAmount: num(row.discount_amount),
    totalAmount: num(row.grand_total),
    description: '',
    items: [],
    itemsCount: row.purchase_order_details_count,
  };
}

function mapDetail(d: ApiDetail): PurchaseOrder {
  return {
    id: String(d.id),
    reference: d.purchase_ref,
    transactionDate: toIso(d.transaction_date),
    vendor: d.vendor?.vendor_name ?? '',
    warehouse: String(d.warehouse_id),
    amount: num(d.amount),
    discountAmount: num(d.discount_amount),
    totalAmount: num(d.grand_total),
    description: d.note ?? '',
    items: (d.items ?? []).map((it) => ({
      id: String(it.id),
      itemId: String(it.item_id),
      itemCode: it.item_code,
      itemName: it.item_name,
      cost: num(it.purchase_cost),
      qty: num(it.purchase_qty),
      image: it.image ?? '',
    })),
  };
}

export type PurchaseOrderListQuery = {
  page: number;
  search?: string;
  warehouse?: ApiOption | null;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

/** GET /purchase-orders (paginated). Falls back to the local store with no API. */
export async function fetchPurchaseOrders(query: PurchaseOrderListQuery): Promise<PurchaseOrderPage> {
  if (!isApiConfigured()) {
    return listLocalPurchaseOrders({
      page: query.page,
      search: query.search,
      warehouse: query.warehouse?.name ?? '',
      dateFrom: query.dateFrom ? new Date(`${query.dateFrom}T00:00:00`).getTime() : undefined,
      dateTo: query.dateTo ? new Date(`${query.dateTo}T23:59:59`).getTime() : undefined,
    });
  }

  const { data } = await api.get<ApiListResponse>('/purchase-orders', {
    params: {
      page: query.page,
      search: query.search || undefined,
      warehouse_id: query.warehouse?.id || undefined,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
    },
  });

  return {
    items: data.data.map(mapListItem),
    total: data.total,
    totalPages: data.last_page,
    page: data.current_page,
  };
}

/** GET /purchase-orders/{id}. Falls back to the local store with no API. */
export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  if (!isApiConfigured()) return getLocalPurchaseOrder(id);
  const { data } = await api.get<ApiDetail>(`/purchase-orders/${id}`);
  return mapDetail(data);
}
