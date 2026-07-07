import { api } from '@/api/client';

export type TransferInItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  image: string;
  qty: number;
  transferCount: number;
};

export type TransferInCategory = {
  categoryId: string;
  categoryName: string;
  totalQty: number;
  itemCount: number;
  items: TransferInItem[];
};

export type TransferInReport = {
  dateFrom: string;
  dateTo: string;
  totalQty: number;
  itemCount: number;
  categoryCount: number;
  categories: TransferInCategory[];
};

type RawItem = {
  item_id?: string | number;
  item_code?: string;
  item_name?: string;
  image?: string | null;
  qty?: string | number;
  transfer_count?: string | number;
};

type RawCategory = {
  category_id?: string | number;
  category_name?: string;
  total_qty?: string | number;
  item_count?: string | number;
  items?: RawItem[];
};

type RawResp = {
  date_from?: string;
  date_to?: string;
  total_qty?: string | number;
  item_count?: string | number;
  category_count?: string | number;
  data?: RawCategory[];
};

const num = (v: string | number | undefined | null) => Number(v ?? 0) || 0;

function mapItem(r: RawItem): TransferInItem {
  return {
    itemId: String(r.item_id ?? ''),
    itemCode: r.item_code ?? '',
    itemName: r.item_name ?? r.item_code ?? '',
    image: r.image ?? '',
    qty: num(r.qty),
    transferCount: num(r.transfer_count),
  };
}

function mapCategory(r: RawCategory): TransferInCategory {
  return {
    categoryId: String(r.category_id ?? ''),
    categoryName: r.category_name ?? '',
    totalQty: num(r.total_qty),
    itemCount: num(r.item_count),
    items: (r.items ?? []).map(mapItem),
  };
}

export type TransferInQuery = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  branchId?: string;
  search?: string;
};

/** GET /stock-transfers-in/items — incoming stock transfers for a period, grouped by category. */
export async function fetchTransfersIn({
  dateFrom,
  dateTo,
  branchId,
  search,
}: TransferInQuery): Promise<TransferInReport> {
  const { data } = await api.get<RawResp>('/stock-transfers-in/items', {
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
    totalQty: num(data.total_qty),
    itemCount: num(data.item_count),
    categoryCount: num(data.category_count),
    categories: (data.data ?? []).map(mapCategory),
  };
}
