import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import {
  getPurchaseOrder as getLocalPurchaseOrder,
  listPurchaseOrders as listLocalPurchaseOrders,
  STATUS_META,
  VENDORS,
  WAREHOUSES,
  type PurchaseOrder,
  type PurchaseOrderPage,
  type PurchaseOrderStatus,
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
  purchase_ref?: string;
  transaction_date?: string;
  amount?: string | number;
  discount_amount?: string | number;
  grand_total?: string | number;
  warehouse_id?: string | number;
  vendor: ApiVendor | null;
  status?: string;
  created_at?: string;
  confirmed_at?: string;
  purchase_order_details_count?: number;
  // Purchase-invoice aliases (same shape, different field names).
  invoice_ref?: string;
  invoice_no?: string;
  reference?: string;
  invoice_date?: string;
  date?: string;
  total?: string | number;
  purchase_invoice_details_count?: number;
  purchase_invoice_items_count?: number;
  invoice_details_count?: number;
  details_count?: number;
  items_count?: number;
  item_count?: number;
  line_items_count?: number;
  // The invoice carries the source PO, which includes an item_count.
  purchase_order?: { item_count?: number } | null;
  // Some list endpoints embed the line rows instead of a count. The invoice
  // list nests them under `details`.
  details?: unknown[];
  items?: unknown[];
  purchase_invoice_details?: unknown[];
  purchase_invoice_items?: unknown[];
  purchase_order_details?: unknown[];
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
  item_id?: string | number;
  item_code?: string;
  code?: string;
  item_name?: string;
  name?: string;
  image?: string | null;
  thumbnail?: string | null;
  purchase_cost?: string | number;
  cost?: string | number;
  price?: string | number;
  purchase_qty?: string | number;
  receive_qty?: string | number;
  receive_quantity?: string | number;
  qty?: string | number;
  quantity?: string | number;
  amount?: string | number;
  discount_amount?: string | number;
  total_cost?: string | number;
  grand_total?: string | number;
  is_unique?: string | number;
};

type ApiDetail = {
  id: number;
  purchase_ref?: string;
  transaction_date?: string;
  note: string | null;
  amount?: string | number;
  discount_amount?: string | number;
  grand_total?: string | number;
  warehouse_id?: string | number;
  vendor: ApiVendor | null;
  status?: string;
  items?: ApiDetailItem[];
  // Purchase-invoice aliases.
  invoice_ref?: string;
  invoice_no?: string;
  reference?: string;
  invoice_date?: string;
  date?: string;
  total?: string | number;
  // Real timestamps (with a time-of-day) — the business date is date-only.
  created_at?: string;
  confirmed_at?: string;
  // Invoice detail may nest the line rows under a different key.
  purchase_invoice_details?: ApiDetailItem[];
  purchase_invoice_items?: ApiDetailItem[];
  purchase_order_details?: ApiDetailItem[];
  details?: ApiDetailItem[];
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;

// Parse a backend date/datetime into a Date (local). Handles date-only
// ("YYYY-MM-DD"), space-separated ("YYYY-MM-DD HH:mm:ss", treated as local),
// and ISO with a "Z"/offset (converted to local). Returns null when unparseable.
const parseDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const trimmed = s.trim();
  const iso =
    trimmed.length <= 10 ? `${trimmed}T00:00:00` : trimmed.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

// The business date (transaction_date/invoice_date) is date-only, so on its own
// it renders as 00:00 (12:00 AM). Keep that date but borrow the time-of-day from
// a real timestamp (created_at/confirmed_at) when one is available.
const mergeDateAndTime = (
  businessDate?: string | null,
  timeSource?: string | null,
): string => {
  const date = parseDate(businessDate);
  const time = parseDate(timeSource);
  if (!date) return time ? time.toISOString() : '';
  if (time && (time.getHours() || time.getMinutes() || time.getSeconds())) {
    date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  }
  return date.toISOString();
};
// Only surface a status the app knows how to render (STATUS_META keys); anything
// else (or missing) stays undefined so StatusBadge/lookups never crash.
const toStatus = (s?: string | null): PurchaseOrderStatus | undefined =>
  s && s in STATUS_META ? (s as PurchaseOrderStatus) : undefined;

function mapListItem(row: ApiListItem): PurchaseOrder {
  return {
    id: String(row.id),
    reference: row.purchase_ref ?? row.invoice_ref ?? row.invoice_no ?? row.reference ?? '',
    transactionDate: mergeDateAndTime(
      row.transaction_date ?? row.invoice_date ?? row.date,
      row.created_at ?? row.confirmed_at,
    ),
    vendor: row.vendor?.vendor_name ?? '',
    vendorId: row.vendor ? String(row.vendor.id) : undefined,
    warehouse: String(row.warehouse_id ?? ''),
    amount: num(row.amount),
    discountAmount: num(row.discount_amount),
    totalAmount: num(row.grand_total ?? row.total),
    description: '',
    status: toStatus(row.status),
    items: [],
    itemsCount:
      row.purchase_order_details_count ??
      row.purchase_invoice_details_count ??
      row.purchase_invoice_items_count ??
      row.invoice_details_count ??
      row.details_count ??
      row.items_count ??
      row.item_count ??
      row.line_items_count ??
      row.details?.length ??
      row.purchase_order?.item_count ??
      row.items?.length ??
      row.purchase_invoice_details?.length ??
      row.purchase_invoice_items?.length ??
      row.purchase_order_details?.length ??
      0,
  };
}

function mapDetail(d: ApiDetail): PurchaseOrder {
  return {
    id: String(d.id),
    reference: d.purchase_ref ?? d.invoice_ref ?? d.invoice_no ?? d.reference ?? '',
    transactionDate: mergeDateAndTime(
      d.transaction_date ?? d.invoice_date ?? d.date,
      d.created_at ?? d.confirmed_at,
    ),
    vendor: d.vendor?.vendor_name ?? '',
    vendorId: d.vendor ? String(d.vendor.id) : undefined,
    warehouse: String(d.warehouse_id ?? ''),
    amount: num(d.amount),
    discountAmount: num(d.discount_amount),
    totalAmount: num(d.grand_total ?? d.total),
    description: d.note ?? '',
    status: toStatus(d.status),
    items: (
      d.items ??
      d.purchase_invoice_details ??
      d.purchase_invoice_items ??
      d.purchase_order_details ??
      d.details ??
      []
    ).map((it) => ({
      id: String(it.id),
      itemId: String(it.item_id ?? ''),
      itemCode: it.item_code ?? it.code ?? '',
      itemName: it.item_name ?? it.name ?? it.item_code ?? it.code ?? '',
      cost: num(it.purchase_cost ?? it.cost ?? it.price),
      qty: num(it.purchase_qty ?? it.receive_qty ?? it.receive_quantity ?? it.qty ?? it.quantity),
      image: it.image ?? it.thumbnail ?? '',
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

export type PurchaseInvoiceListQuery = {
  page: number;
  search?: string;
  status?: string;
  perPage?: number;
};

/**
 * GET /purchase-invoices (paginated). Purchase invoices share the purchase-order
 * shape, so they reuse the same mappers and types. The list endpoint only
 * supports search/status/per_page filters (no warehouse/date). No local mock
 * exists, so this returns an empty page when the API isn't configured.
 */
export async function fetchPurchaseInvoices(query: PurchaseInvoiceListQuery): Promise<PurchaseOrderPage> {
  if (!isApiConfigured()) {
    return { items: [], total: 0, totalPages: 1, page: query.page };
  }

  const { data } = await api.get<ApiListResponse>('/purchase-invoices', {
    params: {
      page: query.page,
      search: query.search || undefined,
      status: query.status || undefined,
      per_page: query.perPage || undefined,
    },
  });

  // TEMP: log the first invoice row's keys so we can confirm the exact field
  // names (item count, ref, date, total). Remove once the mapping is verified.
  if (__DEV__ && data.data?.[0]) {
    console.log('[purchase-invoices] row keys:', Object.keys(data.data[0]));
    console.log('[purchase-invoices] row sample:', JSON.stringify(data.data[0]));
  }

  return {
    items: data.data.map(mapListItem),
    total: data.total,
    totalPages: data.last_page,
    page: data.current_page,
  };
}

/** GET /purchase-invoices/{id}. */
export async function fetchPurchaseInvoice(id: string): Promise<PurchaseOrder | undefined> {
  if (!isApiConfigured()) return undefined;
  const { data } = await api.get<ApiDetail>(`/purchase-invoices/${id}`);
  // TEMP: confirm the detail keys + the line-items array shape. Remove once verified.
  if (__DEV__) {
    console.log('[purchase-invoice detail] keys:', Object.keys(data ?? {}));
    console.log('[purchase-invoice detail] sample:', JSON.stringify(data));
  }
  return mapDetail(data);
}

/** One line of the create-invoice body (mirrors the purchase-order item body). */
export type PurchaseInvoiceItemBody = {
  item_id: string;
  item_code: string;
  item_name: string;
  cost: number;
  qty: number;
  discount_amount: number;
  is_unique: boolean;
};

/** Body for POST /purchase-invoices when generating from a purchase order. */
export type CreatePurchaseInvoiceBody = {
  purchase_order_id: string;
  date: string;
  vendor_id: string;
  warehouse_id: string;
  /** The branch the user is currently signed in to. */
  branch_login_id: string;
  discount_amount: number;
  note: string;
  /** false → save a draft; true → save-and-confirm (writes stock). */
  confirm: boolean;
  items: PurchaseInvoiceItemBody[];
};

/** POST /purchase-invoices — create an invoice from a purchase order. */
export async function createPurchaseInvoice(
  body: CreatePurchaseInvoiceBody,
): Promise<unknown> {
  const { data } = await api.post('/purchase-invoices', body);
  return data;
}
