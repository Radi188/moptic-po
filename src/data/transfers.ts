/**
 * Mock stock-transfer store. In-memory backend for the list, detail, edit,
 * create and approve/decline flows. Replace with real API calls later.
 */

import { formatDate, formatDateTime, formatMoney, WAREHOUSES } from '@/data/purchase-orders';

export { formatDate, formatDateTime, formatMoney, WAREHOUSES };

export type TransferStatus = 'pending' | 'approved' | 'declined';

export type TransferItem = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  cost: number;
  qty: number;
  category: string;
  image: string;
  uniqueId: string;
};

export type StockTransfer = {
  id: string;
  reference: string;
  fromWarehouse: string;
  toWarehouse: string;
  transactionDate: string; // ISO
  description: string;
  userRequest: string;
  status: TransferStatus;
  items: TransferItem[];
  /** From the list endpoint when the full items array isn't loaded. */
  itemsCount?: number;
};

export const STATUS_META: Record<TransferStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#F5A623' },
  approved: { label: 'Approved', color: '#30A46C' },
  declined: { label: 'Declined', color: '#e5484d' },
};

export const TRANSFER_STATUSES: TransferStatus[] = ['pending', 'approved', 'declined'];

/** Transfers can only be edited while still pending. */
export function canEditTransfer(status: TransferStatus) {
  return status === 'pending';
}

const USERS = ['stockthom', 'admin', 'dara', 'sophea'];

const SAMPLE_ITEMS = [
  { code: 'TR30283', name: 'TR30283', category: 'Frames' },
  { code: '7025', name: '7025', category: 'Frames' },
  { code: '25070', name: '25070', category: 'Frames' },
  { code: '73006', name: '73006', category: 'Sunglasses' },
  { code: 'PT08040', name: 'PT08040', category: 'Frames' },
  { code: 'LV-26178', name: 'LV-26178', category: 'Frames' },
];

function seedItems(i: number): TransferItem[] {
  const count = 1 + (i % 4);
  return Array.from({ length: count }, (_, j) => {
    const sample = SAMPLE_ITEMS[(i + j) % SAMPLE_ITEMS.length];
    return {
      id: `tri-${i}-${j}`,
      itemId: '',
      itemCode: sample.code,
      itemName: sample.name,
      cost: 0,
      qty: 1 + ((i + j) % 3),
      category: sample.category,
      image: '',
      uniqueId: '',
    };
  });
}

function seed(): StockTransfer[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(2026, 5, 1 + (i % 27), 9 + (i % 9), (i * 11) % 60);
    return {
      id: `tr-${1000 + i}`,
      reference: `T2606${(94667 + i).toString().padStart(6, '0')}`,
      fromWarehouse: WAREHOUSES[i % WAREHOUSES.length],
      toWarehouse: WAREHOUSES[(i + 1) % WAREHOUSES.length],
      transactionDate: date.toISOString(),
      description: i % 3 === 0 ? 'Branch restock' : '',
      userRequest: USERS[i % USERS.length],
      status: TRANSFER_STATUSES[i % TRANSFER_STATUSES.length],
      items: seedItems(i),
    };
  });
}

let store: StockTransfer[] = seed();

export type TransferPage = {
  items: StockTransfer[];
  total: number;
  totalPages: number;
  page: number;
};

export type TransferQuery = {
  page: number;
  pageSize?: number;
  search?: string;
  status?: TransferStatus | 'all';
};

export function listTransfers({
  page,
  pageSize = 8,
  search = '',
  status = 'all',
}: TransferQuery): TransferPage {
  const term = search.trim().toLowerCase();
  let filtered = store;
  if (status !== 'all') {
    filtered = filtered.filter((transfer) => transfer.status === status);
  }
  if (term) {
    filtered = filtered.filter(
      (transfer) =>
        transfer.reference.toLowerCase().includes(term) ||
        transfer.fromWarehouse.toLowerCase().includes(term) ||
        transfer.toWarehouse.toLowerCase().includes(term),
    );
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total,
    totalPages,
    page: current,
  };
}

export function getTransfer(id: string): StockTransfer | undefined {
  return store.find((transfer) => transfer.id === id);
}

export type TransferInput = {
  fromWarehouse: string;
  toWarehouse: string;
  transactionDate: string;
  description: string;
  items: TransferItem[];
};

export function addTransfer(input: TransferInput): StockTransfer {
  const transfer: StockTransfer = {
    id: `tr-${Date.now()}`,
    reference: `T${Date.now().toString().slice(-10)}`,
    userRequest: 'You',
    status: 'pending',
    ...input,
  };
  store = [transfer, ...store];
  return transfer;
}

export function updateTransfer(id: string, input: TransferInput): void {
  store = store.map((transfer) =>
    transfer.id === id ? { ...transfer, ...input } : transfer,
  );
}

export function setTransferStatus(id: string, status: TransferStatus): void {
  store = store.map((transfer) => (transfer.id === id ? { ...transfer, status } : transfer));
}

/** Builds a transfer line item from an inventory product. */
export function newTransferItem(product: {
  id?: string;
  code: string;
  name: string;
  cost: number;
  category?: string;
  image?: string;
}): TransferItem {
  return {
    id: `tri-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    itemId: product.id ?? '',
    itemCode: product.code,
    itemName: product.name,
    cost: product.cost,
    qty: 1,
    category: product.category ?? '',
    image: product.image ?? '',
    uniqueId: '',
  };
}
