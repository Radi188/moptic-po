import { api } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import {
  getDashboardData,
  withThousands,
  type Activity,
  type DashboardData,
  type LowStockItem,
  type Stat,
} from '@/data/dashboard';

type ApiSummary = {
  total_items: number;
  pending_pos: number;
  low_stock: number;
  out_of_stock: number;
};

type ApiLowStock = {
  item_id: string;
  item_code: string;
  item_name: string;
  qty_left: string;
  min_qty: string;
  warehouse_id: string;
};

type ApiActivity = {
  type: string;
  description: string;
  reference: string;
  event: string;
  qty: number;
  created_at: string;
};

type ApiDashboard = {
  branch_id: number;
  summary: ApiSummary;
  low_stock_alerts: ApiLowStock[];
  recent_activity: ApiActivity[];
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))}m ago`;
  if (diff < day) return `${Math.round(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function mapDashboard(data: ApiDashboard): DashboardData {
  const stats: Stat[] = [
    {
      key: 'total',
      label: 'Total Items',
      value: withThousands(data.summary.total_items),
      icon: 'cube-outline',
      tone: 'brand',
    },
    {
      key: 'pending',
      label: 'Pending POs',
      value: withThousands(data.summary.pending_pos),
      icon: 'receipt-outline',
      tone: 'success',
    },
    {
      key: 'low',
      label: 'Low Stock',
      value: withThousands(data.summary.low_stock),
      icon: 'alert-circle-outline',
      tone: 'warning',
    },
    {
      key: 'out',
      label: 'Out of Stock',
      value: withThousands(data.summary.out_of_stock),
      icon: 'close-circle-outline',
      tone: 'danger',
    },
  ];

  const lowStock: LowStockItem[] = (data.low_stock_alerts ?? []).map((row) => ({
    id: row.item_id,
    name: row.item_name,
    sku: row.item_code,
    qty: Number(row.qty_left) || 0,
    reorderLevel: Number(row.min_qty) || 0,
  }));

  const activity: Activity[] = (data.recent_activity ?? []).map((row, index) => ({
    id: `${row.reference}-${index}`,
    type: row.type,
    title: row.description || row.type,
    reference: row.reference,
    qty: row.qty,
    time: timeAgo(row.created_at),
  }));

  return { stats, lowStock, activity };
}

/** GET /staff/stock-dashboard?branch_id=… (falls back to mock when no API URL). */
export async function fetchStockDashboard(branchId: string): Promise<DashboardData> {
  if (!isApiConfigured()) return getDashboardData(branchId);
  const { data } = await api.get<ApiDashboard>('/stock-dashboard', {
    params: { branch_id: branchId },
  });
  return mapDashboard(data);
}
