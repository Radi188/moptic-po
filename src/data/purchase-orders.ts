/**
 * Mock purchase-order store. Acts as an in-memory backend so the list, detail,
 * edit and create flows all read/write the same data during a session. Replace
 * the functions with real API calls when a backend is available.
 */

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'received'
  | 'cancelled';

export type PurchaseOrderItem = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  cost: number;
  qty: number;
  image?: string;
};

export type PurchaseOrder = {
  id: string;
  reference: string;
  transactionDate: string; // ISO
  vendor: string;
  warehouse: string;
  amount: number;
  discountAmount: number;
  totalAmount: number;
  description: string;
  /** Optional — the API list/detail responses don't include a status. */
  status?: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  /** From the list endpoint when the full items array isn't loaded. */
  itemsCount?: number;
};

export const STATUS_META: Record<PurchaseOrderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#8B8D98' },
  pending: { label: 'Pending', color: '#F5A623' },
  approved: { label: 'Approved', color: '#232843' },
  received: { label: 'Received', color: '#30A46C' },
  cancelled: { label: 'Cancelled', color: '#e5484d' },
};

export const ORDER_STATUSES: PurchaseOrderStatus[] = [
  'draft',
  'pending',
  'approved',
  'received',
  'cancelled',
];

/** Orders can only be edited while still in draft or pending. */
export function canEditOrder(status?: PurchaseOrderStatus) {
  return status === 'draft' || status === 'pending';
}

export const VENDORS = [
  'Default Vendor',
  'Acme Supplies',
  'Mekong Traders',
  'Angkor Distribution',
  'Bayon Wholesale',
];

export const WAREHOUSES = [
  'Main Warehouse',
  'Cold Storage',
  'Front Store Stock',
  'Transit Warehouse',
];

export type Product = { id: string; code: string; name: string; cost: number };

export const PRODUCTS: Product[] = [
  { id: 'itm-1', code: '1.61GOLD-2.00/-0.25', name: '1.61 Gold AR Lens', cost: 45 },
  { id: 'itm-2', code: '1.56RED-0.00', name: '1.56 Red Coat Lens', cost: 35 },
  { id: 'itm-3', code: '1.61GOLD-2.75/-0.50', name: '1.61 Gold AR Lens', cost: 45 },
  { id: 'itm-4', code: '1.56GOLD-0.00', name: '1.56 Gold Coat Lens', cost: 25 },
  { id: 'itm-5', code: 'UV400-3.50', name: 'UV400 Sun Lens', cost: 10 },
  { id: 'itm-6', code: 'UV400-0.50/-0.25', name: 'UV400 Sun Lens', cost: 10 },
  { id: 'itm-7', code: 'UV400-0.00', name: 'UV400 Sun Lens', cost: 10 },
];

function seedItems(i: number): PurchaseOrderItem[] {
  const count = 1 + (i % 4);
  const items: PurchaseOrderItem[] = [];
  for (let j = 0; j < count; j++) {
    const product = PRODUCTS[(i + j) % PRODUCTS.length];
    items.push({
      id: `poi-${i}-${j}`,
      itemId: product.id,
      itemCode: product.code,
      itemName: product.name,
      cost: product.cost,
      qty: 1 + ((i + j) % 3),
    });
  }
  return items;
}

export function itemTotal(item: PurchaseOrderItem) {
  return item.cost * item.qty;
}

export function itemsAmount(items: PurchaseOrderItem[]) {
  return items.reduce((sum, item) => sum + itemTotal(item), 0);
}

/** Creates a fresh line item from a catalog product. */
export function newItemFromProduct(product: Product): PurchaseOrderItem {
  return {
    id: `poi-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    itemId: product.id,
    itemCode: product.code,
    itemName: product.name,
    cost: product.cost,
    qty: 1,
  };
}

function seed(): PurchaseOrder[] {
  const orders: PurchaseOrder[] = [];
  for (let i = 0; i < 24; i++) {
    const items = seedItems(i);
    const amount = itemsAmount(items);
    const discountAmount = i % 4 === 0 ? 5 : 0;
    const date = new Date(2026, 5, 1 + (i % 27), 9 + (i % 9), (i * 7) % 60);
    orders.push({
      id: `po-${1000 + i}`,
      reference: `P2606${(17758 + i).toString().padStart(6, '0')}`,
      transactionDate: date.toISOString(),
      vendor: VENDORS[i % VENDORS.length],
      warehouse: WAREHOUSES[i % WAREHOUSES.length],
      amount,
      discountAmount,
      totalAmount: amount - discountAmount,
      description: i % 3 === 0 ? 'Monthly restock' : '',
      status: ORDER_STATUSES[i % ORDER_STATUSES.length],
      items,
    });
  }
  return orders;
}

let store: PurchaseOrder[] = seed();

export type PurchaseOrderPage = {
  items: PurchaseOrder[];
  total: number;
  totalPages: number;
  page: number;
};

export type PurchaseOrderQuery = {
  page: number;
  pageSize?: number;
  search?: string;
  warehouse?: string;
  /** Inclusive range over the order's transaction date (epoch ms). */
  dateFrom?: number;
  dateTo?: number;
};

export function listPurchaseOrders({
  page,
  pageSize = 8,
  search = '',
  warehouse = '',
  dateFrom,
  dateTo,
}: PurchaseOrderQuery): PurchaseOrderPage {
  const term = search.trim().toLowerCase();
  let filtered = store;
  if (warehouse) {
    filtered = filtered.filter((order) => order.warehouse === warehouse);
  }
  if (dateFrom != null) {
    filtered = filtered.filter((order) => new Date(order.transactionDate).getTime() >= dateFrom);
  }
  if (dateTo != null) {
    filtered = filtered.filter((order) => new Date(order.transactionDate).getTime() <= dateTo);
  }
  if (term) {
    filtered = filtered.filter(
      (order) =>
        order.reference.toLowerCase().includes(term) ||
        order.vendor.toLowerCase().includes(term),
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

export function getPurchaseOrder(id: string): PurchaseOrder | undefined {
  return store.find((order) => order.id === id);
}

export type PurchaseOrderInput = {
  transactionDate: string;
  vendor: string;
  warehouse: string;
  discountAmount: number;
  description: string;
  items: PurchaseOrderItem[];
};

export function addPurchaseOrder(input: PurchaseOrderInput): PurchaseOrder {
  const amount = itemsAmount(input.items);
  const order: PurchaseOrder = {
    id: `po-${Date.now()}`,
    reference: `P${Date.now().toString().slice(-10)}`,
    transactionDate: input.transactionDate,
    vendor: input.vendor,
    warehouse: input.warehouse,
    amount,
    discountAmount: input.discountAmount,
    totalAmount: amount - input.discountAmount,
    description: input.description,
    status: 'draft',
    items: input.items,
  };
  store = [order, ...store];
  return order;
}

export function updatePurchaseOrder(id: string, input: PurchaseOrderInput): void {
  const amount = itemsAmount(input.items);
  store = store.map((order) =>
    order.id === id
      ? {
          ...order,
          ...input,
          amount,
          totalAmount: amount - input.discountAmount,
        }
      : order,
  );
}

export function formatMoney(value: number) {
  return `${value.toFixed(2)} $`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const day = DAYS[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const hours = d.getHours() % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${dd}-${mm}-${yyyy} ${hours}:${minutes} ${ampm}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
