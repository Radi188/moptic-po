/**
 * Mock dashboard data for the Home screen. Figures are derived from the branch
 * id so switching branches visibly changes the numbers. Replace `getDashboardData`
 * with a real API call (keyed by branch) when a backend is available.
 */

export type StatTone = 'brand' | 'warning' | 'danger' | 'success';

export type Stat = {
  key: string;
  label: string;
  value: string;
  icon: string;
  tone: StatTone;
};

export type LowStockItem = {
  id: string;
  name: string;
  sku: string;
  qty: number;
  reorderLevel: number;
};

export type Activity = {
  id: string;
  /** A label for the activity kind, e.g. "Sale", "Purchase", "Transfer". */
  type: string;
  title: string;
  reference: string;
  qty: number;
  time: string;
};

export type DashboardData = {
  stats: Stat[];
  lowStock: LowStockItem[];
  activity: Activity[];
};

function seedFrom(branchId: string) {
  return [...branchId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

export function withThousands(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function getDashboardData(branchId: string): DashboardData {
  const seed = seedFrom(branchId);

  const totalItems = 820 + (seed % 7) * 84;
  const pendingOrders = 2 + (seed % 6);
  const lowStockCount = 6 + (seed % 9);
  const outOfStock = seed % 4;

  const stats: Stat[] = [
    {
      key: 'total',
      label: 'Total Items',
      value: withThousands(totalItems),
      icon: 'cube-outline',
      tone: 'brand',
    },
    {
      key: 'pending',
      label: 'Pending POs',
      value: `${pendingOrders}`,
      icon: 'receipt-outline',
      tone: 'success',
    },
    {
      key: 'low',
      label: 'Low Stock',
      value: `${lowStockCount}`,
      icon: 'alert-circle-outline',
      tone: 'warning',
    },
    {
      key: 'out',
      label: 'Out of Stock',
      value: `${outOfStock}`,
      icon: 'close-circle-outline',
      tone: 'danger',
    },
  ];

  const lowStock: LowStockItem[] = [
    { id: 'l1', name: 'AA Alkaline Batteries (12pk)', sku: 'BAT-AA-12', qty: 4, reorderLevel: 20 },
    { id: 'l2', name: 'Thermal Receipt Roll 80mm', sku: 'PAP-TR-80', qty: 7, reorderLevel: 25 },
    { id: 'l3', name: 'USB-C Cable 1m', sku: 'CBL-USBC-1', qty: 9, reorderLevel: 30 },
    { id: 'l4', name: 'Packing Tape 48mm', sku: 'TAP-PK-48', qty: 11, reorderLevel: 40 },
  ];

  const activity: Activity[] = [
    {
      id: 'a1',
      type: 'Purchase',
      title: 'Received purchase order',
      reference: 'PO-1042',
      qty: 120,
      time: '2h ago',
    },
    {
      id: 'a2',
      type: 'Transfer',
      title: 'Stock transfer out',
      reference: 'TRF-0007',
      qty: -8,
      time: '4h ago',
    },
    {
      id: 'a3',
      type: 'Adjustment',
      title: 'Cycle count adjustment',
      reference: 'ADJ-0098',
      qty: -2,
      time: 'Yesterday',
    },
    {
      id: 'a4',
      type: 'Purchase',
      title: 'Received purchase order',
      reference: 'PO-1039',
      qty: 60,
      time: 'Yesterday',
    },
  ];

  return { stats, lowStock, activity };
}
