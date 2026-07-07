import { api } from '@/api/client';

export type SaleSummaryTotals = {
  totalInvoices: number;
  totalQty: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  itemCount: number;
  categoryCount: number;
};

export type SaleSummaryItem = {
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

export type SaleSummaryCategory = {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  itemCount: number;
  items: SaleSummaryItem[];
};

export type SaleSummaryReport = {
  dateFrom: string;
  dateTo: string;
  branchId: string | null;
  summary: SaleSummaryTotals;
  categories: SaleSummaryCategory[];
};

type RawItem = {
  item_id?: string | number;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  qty_sold?: string | number;
  revenue?: string | number;
  cost?: string | number;
  profit?: string | number;
  invoice_count?: string | number;
};

type RawCategory = {
  category_id?: string | number;
  category_name?: string;
  total_qty?: string | number;
  item_count?: string | number;
  items?: RawItem[];
};

type RawSummary = {
  total_invoices?: string | number;
  total_qty?: string | number;
  total_revenue?: string | number;
  total_cost?: string | number;
  total_profit?: string | number;
  item_count?: string | number;
  category_count?: string | number;
};

type RawResp = {
  date_from?: string;
  date_to?: string;
  branch_id?: string | number | null;
  summary?: RawSummary;
  data?: RawCategory[];
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;

function mapItem(r: RawItem): SaleSummaryItem {
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

function mapCategory(r: RawCategory): SaleSummaryCategory {
  return {
    categoryId: String(r.category_id ?? ''),
    categoryName: r.category_name ?? '',
    totalQty: num(r.total_qty),
    itemCount: num(r.item_count),
    items: (r.items ?? []).map(mapItem),
  };
}

function mapSummary(s: RawSummary | undefined): SaleSummaryTotals {
  return {
    totalInvoices: num(s?.total_invoices),
    totalQty: num(s?.total_qty),
    totalRevenue: num(s?.total_revenue),
    totalCost: num(s?.total_cost),
    totalProfit: num(s?.total_profit),
    itemCount: num(s?.item_count),
    categoryCount: num(s?.category_count),
  };
}

export type SaleSummaryQuery = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  branchId?: string;
  search?: string;
};

/** GET /sales/items-summary — sales summary for a period, grouped by category. */
export async function fetchSalesSummary({
  dateFrom,
  dateTo,
  branchId,
  search,
}: SaleSummaryQuery): Promise<SaleSummaryReport> {
  const { data } = await api.get<RawResp>('/sales/items-summary', {
    params: {
      date_from: dateFrom,
      date_to: dateTo,
      branch_id: branchId || undefined,
      search: search?.trim() || undefined,
    },
  });
  return {
    dateFrom: data.date_from ?? dateFrom,
    dateTo: data.date_to ?? dateTo,
    branchId: data.branch_id != null ? String(data.branch_id) : null,
    summary: mapSummary(data.summary),
    categories: (data.data ?? []).map(mapCategory),
  };
}
