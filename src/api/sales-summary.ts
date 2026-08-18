import { api } from '@/api/client';

export type SaleSummaryTotals = {
  totalInvoices: number;
  totalQty: number;
  totalSubtotal: number;
  totalDiscount: number;
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
  /** Listed price on the invoice lines. */
  unitPrice: number;
  minPrice: number;
  maxPrice: number;
  /** revenue ÷ qty — what the item actually sold for per unit, after discount. */
  avgSoldPrice: number;
  /** Line total before discount. */
  subtotal: number;
  discount: number;
  /** subtotal − discount. */
  revenue: number;
  cost: number;
  /** revenue − cost. Can be negative. */
  profit: number;
  invoiceCount: number;
};

export type SaleSummaryCategory = {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  totalSubtotal: number;
  totalDiscount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  itemCount: number;
  items: SaleSummaryItem[];
};

/** Laravel pagination meta. Counts **categories**, not items. */
export type SaleSummaryMeta = {
  currentPage: number;
  perPage: number;
  lastPage: number;
  total: number;
  count: number;
  from: number | null;
  to: number | null;
};

export type SaleSummaryPage = {
  dateFrom: string;
  dateTo: string;
  branchId: string | null;
  summary: SaleSummaryTotals;
  categories: SaleSummaryCategory[];
  meta: SaleSummaryMeta;
};

type RawItem = {
  item_id?: string | number;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  qty_sold?: string | number;
  unit_price?: string | number;
  min_price?: string | number;
  max_price?: string | number;
  avg_sold_price?: string | number;
  subtotal?: string | number;
  discount?: string | number;
  revenue?: string | number;
  cost?: string | number;
  profit?: string | number;
  invoice_count?: string | number;
};

type RawCategory = {
  category_id?: string | number | null;
  category_name?: string;
  total_qty?: string | number;
  total_subtotal?: string | number;
  total_discount?: string | number;
  total_revenue?: string | number;
  total_cost?: string | number;
  total_profit?: string | number;
  item_count?: string | number;
  items?: RawItem[];
};

type RawSummary = {
  total_invoices?: string | number;
  total_qty?: string | number;
  total_subtotal?: string | number;
  total_discount?: string | number;
  total_revenue?: string | number;
  total_cost?: string | number;
  total_profit?: string | number;
  item_count?: string | number;
  category_count?: string | number;
};

type RawMeta = {
  current_page?: string | number;
  per_page?: string | number;
  last_page?: string | number;
  total?: string | number;
  count?: string | number;
  from?: string | number | null;
  to?: string | number | null;
};

type RawResp = {
  date_from?: string;
  date_to?: string;
  branch_id?: string | number | null;
  summary?: RawSummary;
  data?: RawCategory[];
  meta?: RawMeta;
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;
const numOrNull = (v: string | number | undefined | null) =>
  v === null || v === undefined || v === '' ? null : Number(v);

function mapItem(r: RawItem): SaleSummaryItem {
  return {
    // The API sends item_id as a string; keep it one so ids stay stable.
    itemId: String(r.item_id ?? ''),
    itemCode: r.item_code ?? '',
    itemName: r.item_name ?? r.item_code ?? '',
    image: r.image ?? '',
    qtySold: num(r.qty_sold),
    unitPrice: num(r.unit_price),
    minPrice: num(r.min_price),
    maxPrice: num(r.max_price),
    avgSoldPrice: num(r.avg_sold_price),
    subtotal: num(r.subtotal),
    discount: num(r.discount),
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
    totalSubtotal: num(r.total_subtotal),
    totalDiscount: num(r.total_discount),
    totalRevenue: num(r.total_revenue),
    totalCost: num(r.total_cost),
    totalProfit: num(r.total_profit),
    itemCount: num(r.item_count),
    // Every category always arrives with its complete items array — never
    // slice or paginate this client-side.
    items: (r.items ?? []).map(mapItem),
  };
}

function mapSummary(s: RawSummary | undefined): SaleSummaryTotals {
  return {
    totalInvoices: num(s?.total_invoices),
    totalQty: num(s?.total_qty),
    totalSubtotal: num(s?.total_subtotal),
    totalDiscount: num(s?.total_discount),
    totalRevenue: num(s?.total_revenue),
    totalCost: num(s?.total_cost),
    totalProfit: num(s?.total_profit),
    itemCount: num(s?.item_count),
    categoryCount: num(s?.category_count),
  };
}

function mapMeta(m: RawMeta | undefined, page: number): SaleSummaryMeta {
  return {
    currentPage: m?.current_page != null ? num(m.current_page) : page,
    perPage: num(m?.per_page),
    lastPage: m?.last_page != null ? num(m.last_page) : page,
    total: num(m?.total),
    count: num(m?.count),
    from: numOrNull(m?.from),
    to: numOrNull(m?.to),
  };
}

export type SaleSummaryQuery = {
  dateFrom?: string; // YYYY-MM-DD, defaults server-side to the 1st of this month
  dateTo?: string; // YYYY-MM-DD, defaults server-side to today
  branchId?: string;
  /** Invoice type (e.g. 'R'). */
  type?: string;
  categoryId?: string;
  /** Partial category name match (Khmer + English). */
  categorySearch?: string;
  page?: number;
  perPage?: number;
};

/**
 * GET /sales/items-summary — sales for a period, grouped by category.
 *
 * Pagination is **by category**: `meta.total`/`meta.last_page` count category
 * groups and each group carries all of its items. `summary` always covers the
 * whole date range, not the current page, so only the first page's summary is
 * meaningful.
 */
export async function fetchSalesSummary({
  dateFrom,
  dateTo,
  branchId,
  type,
  categoryId,
  categorySearch,
  page = 1,
  perPage,
}: SaleSummaryQuery = {}): Promise<SaleSummaryPage> {
  const { data } = await api.get<RawResp>('/sales/items-summary', {
    params: {
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      branch_id: branchId || undefined,
      type: type || undefined,
      category_id: categoryId || undefined,
      category_search: categorySearch?.trim() || undefined,
      page,
      per_page: perPage || undefined,
    },
  });
  return {
    dateFrom: data.date_from ?? dateFrom ?? '',
    dateTo: data.date_to ?? dateTo ?? '',
    branchId: data.branch_id != null ? String(data.branch_id) : null,
    summary: mapSummary(data.summary),
    categories: (data.data ?? []).map(mapCategory),
    meta: mapMeta(data.meta, page),
  };
}
