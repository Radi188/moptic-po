import { api } from '@/api/client';

/**
 * Per-branch daily item sales, used by the Stock Refill flow to decide how much
 * to transfer back to each branch.
 *
 * GET /sales/items?date=YYYY-MM-DD&branch_id=11
 */
const ENDPOINT = '/sales/items';

export type SoldItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  image: string;
  qtySold: number;
  revenue: number;
  cost: number;
  profit: number;
  invoiceCount: number;
};

export type BranchSalesSummary = {
  totalInvoices: number;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  itemCount: number;
};

export type BranchSales = {
  summary: BranchSalesSummary;
  items: SoldItem[];
};

type RawItem = {
  item_id?: number | string;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  qty_sold?: string | number;
  revenue?: string | number;
  cost?: string | number;
  profit?: string | number;
  invoice_count?: string | number;
};

type RawSummary = {
  total_invoices?: string | number;
  total_qty?: string | number;
  total_revenue?: string | number;
  total_cost?: string | number;
  total_profit?: string | number;
  item_count?: string | number;
};

/**
 * The endpoint groups sold items by category: each `data` entry is a category
 * with a nested `items` array (it carries `category_*`/`item_count` but NO
 * item fields of its own). We flatten these groups into a flat item list.
 */
type RawGroup = {
  category_id?: number | string;
  category_name?: string;
  total_qty?: string | number;
  item_count?: string | number;
  items?: RawItem[];
};

type RawResp = { summary?: RawSummary; data?: Array<RawItem | RawGroup> };

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;

function mapItem(r: RawItem): SoldItem {
  return {
    itemId: String(r.item_id ?? ''),
    itemCode: r.item_code ?? '',
    itemName: r.item_name ?? r.item_code ?? '',
    image: r.image ?? '',
    qtySold: num(r.qty_sold),
    revenue: num(r.revenue),
    cost: num(r.cost),
    profit: num(r.profit),
    invoiceCount: num(r.invoice_count),
  };
}

function mapSummary(s: RawSummary): BranchSalesSummary {
  return {
    totalInvoices: num(s.total_invoices),
    totalQty: num(s.total_qty),
    totalRevenue: num(s.total_revenue),
    totalCost: num(s.total_cost),
    totalProfit: num(s.total_profit),
    itemCount: num(s.item_count),
  };
}

export type BranchSalesQuery = { date: string; branchId: string };

/** GET /sales/items?date=&branch_id= — sold items + summary for one branch/day. */
export async function fetchBranchSales({ date, branchId }: BranchSalesQuery): Promise<BranchSales> {
  const { data } = await api.get<RawResp>(ENDPOINT, {
    params: { date, branch_id: branchId },
  });
  // `data` is an array of category groups (each with a nested `items` array).
  // Flatten to a flat item list; fall back to treating an entry as an item
  // itself if a future response is already flat (no `items` array).
  const entries = data.data ?? [];
  const rawItems = entries.flatMap((entry) =>
    Array.isArray((entry as RawGroup).items)
      ? ((entry as RawGroup).items as RawItem[])
      : [entry as RawItem],
  );
  return {
    summary: mapSummary(data.summary ?? {}),
    items: rawItems.map(mapItem),
  };
}
