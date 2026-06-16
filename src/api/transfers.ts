import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import {
  getTransfer as getLocalTransfer,
  listTransfers as listLocalTransfers,
  setTransferStatus as setLocalTransferStatus,
  type StockTransfer,
  type TransferItem,
  type TransferPage,
  type TransferStatus,
} from '@/data/transfers';

type ApiUser = { id?: number | string; name?: string };
type ApiWarehouseRef = { warehouse_name?: string };

type ApiListItem = {
  id: number | string;
  transfer_reference: string;
  status: string;
  transaction_date: string;
  from_warehouse?: string | number;
  to_warehouse?: string | number;
  warehouse_from?: ApiWarehouseRef | null;
  warehouse_to?: ApiWarehouseRef | null;
  request_user?: ApiUser | null;
  stock_transfer_details_count?: number;
  note?: string | null;
  description?: string | null;
};

type ApiListResponse =
  | { current_page?: number; last_page?: number; total?: number; data?: ApiListItem[] }
  | ApiListItem[];

type ApiDetailItem = {
  id: number | string;
  item_id?: string | number;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  category?: string;
  purchase_cost?: string | number;
  cost?: string | number;
  item_price?: string | number;
  transfer_qty?: string | number;
  qty?: string | number;
  quantity?: string | number;
  unique_id?: string;
};

type ApiDetail = ApiListItem & {
  note?: string | null;
  description?: string | null;
  stock_transfer_details?: ApiDetailItem[];
  details?: ApiDetailItem[];
  items?: ApiDetailItem[];
};

const num = (v: string | number | undefined) => Number(v ?? 0) || 0;
// Normalise the backend date into something `new Date()` parses reliably:
// keep ISO strings as-is, turn "YYYY-MM-DD HH:mm:ss" into "…THH:mm:ss", and
// treat a bare date as midnight.
const toIso = (s: string) => {
  if (!s) return s;
  if (s.includes('T')) return s;
  if (s.includes(' ')) return s.replace(' ', 'T');
  return `${s}T00:00:00`;
};

function mapStatus(s: string | undefined): TransferStatus {
  const v = String(s ?? '').toLowerCase();
  if (v.includes('approve') || v.includes('confirm') || v.includes('accept')) return 'approved';
  if (v.includes('reject') || v.includes('decline')) return 'declined';
  return 'pending';
}

function mapListItem(row: ApiListItem): StockTransfer {
  return {
    id: String(row.id),
    reference: row.transfer_reference,
    fromWarehouse: row.warehouse_from?.warehouse_name ?? String(row.from_warehouse ?? ''),
    toWarehouse: row.warehouse_to?.warehouse_name ?? String(row.to_warehouse ?? ''),
    transactionDate: toIso(row.transaction_date),
    description: row.note ?? row.description ?? '',
    userRequest: row.request_user?.name ?? '',
    status: mapStatus(row.status),
    items: [],
    itemsCount: row.stock_transfer_details_count ?? 0,
  };
}

function mapDetailItem(it: ApiDetailItem): TransferItem {
  return {
    id: String(it.id),
    itemId: String(it.item_id ?? ''),
    itemCode: it.item_code ?? '',
    itemName: it.item_name ?? it.item_code ?? '',
    cost: num(it.purchase_cost ?? it.cost ?? it.item_price),
    qty: num(it.transfer_qty ?? it.qty ?? it.quantity),
    category: it.category ?? '',
    image: it.image ?? '',
    uniqueId: it.unique_id ?? '',
  };
}

function mapDetail(d: ApiDetail): StockTransfer {
  const rawItems = d.stock_transfer_details ?? d.details ?? d.items ?? [];
  return {
    ...mapListItem(d),
    description: d.note ?? d.description ?? '',
    items: rawItems.map(mapDetailItem),
  };
}

export type TransferListQuery = {
  page: number;
  search?: string;
  status?: TransferStatus | 'all';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
};

/** GET /stock-transfers (paginated). Falls back to the local store with no API. */
export async function fetchTransfers(query: TransferListQuery): Promise<TransferPage> {
  if (!isApiConfigured()) {
    return listLocalTransfers({ page: query.page, search: query.search, status: query.status });
  }

  // The API status values: declined = "reject", pending = "request" (a user
  // requested the transfer), approved = "approve".
  const statusMap: Record<TransferStatus, string> = {
    pending: 'request',
    approved: 'approve',
    declined: 'reject',
  };
  const statusParam =
    query.status && query.status !== 'all' ? statusMap[query.status] : undefined;

  const { data } = await api.get<ApiListResponse>('/stock-transfers', {
    params: {
      page: query.page,
      search: query.search || undefined,
      status: statusParam,
      date_from: query.dateFrom || undefined,
      date_to: query.dateTo || undefined,
    },
  });

  const list = Array.isArray(data) ? data : (data.data ?? []);

  // TEMP: log the distinct status values so we can confirm the exact strings.
  if (__DEV__) {
    console.log('[transfers] statuses on page:', [...new Set(list.map((r) => r.status))]);
  }

  return {
    items: list.map(mapListItem),
    total: Array.isArray(data) ? list.length : (data.total ?? list.length),
    totalPages: Array.isArray(data) ? 1 : (data.last_page ?? 1),
    page: Array.isArray(data) ? 1 : (data.current_page ?? 1),
  };
}

/** GET /stock-transfers/{id}. Falls back to the local store with no API. */
export async function fetchTransfer(id: string): Promise<StockTransfer | undefined> {
  if (!isApiConfigured()) return getLocalTransfer(id);
  const { data } = await api.get<ApiDetail>(`/stock-transfers/${id}`);
  return mapDetail(data);
}

export type TransferItemBody = {
  item_id: number;
  item_code: string;
  item_name: string;
  qty: number;
  is_unique: number;
};

/** Body for POST /stock-transfers. */
export type CreateTransferBody = {
  from_warehouse: number;
  to_warehouse: number;
  branch_login_id: number;
  date: string;
  description: string;
  items: TransferItemBody[];
};

/** POST /stock-transfers. */
export async function createTransfer(body: CreateTransferBody): Promise<unknown> {
  const { data } = await api.post('/stock-transfers', body);
  return data;
}

/** POST /stock-transfers/{id}/approve */
export async function approveTransfer(id: string): Promise<void> {
  if (!isApiConfigured()) {
    setLocalTransferStatus(id, 'approved');
    return;
  }
  await api.post(`/stock-transfers/${id}/approve`);
}

/** POST /stock-transfers/{id}/reject */
export async function declineTransfer(id: string): Promise<void> {
  if (!isApiConfigured()) {
    setLocalTransferStatus(id, 'declined');
    return;
  }
  await api.post(`/stock-transfers/${id}/reject`);
}
