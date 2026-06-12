import { api } from '@/api/client';

/** Per-warehouse stock movement for a period (GET /stock-summary). */
export type WarehouseMovement = {
  warehouseId: string;
  warehouseName: string;
  openingQty: number;
  openingAmount: number;
  purchaseQty: number;
  purchaseAmount: number;
  receivedQty: number;
  receivedAmount: number;
  saleQty: number;
  saleAmount: number;
  transferQty: number;
  transferAmount: number;
  adjustmentQty: number;
  adjustmentAmount: number;
  endingQty: number;
  endingAmount: number;
};

type RawRow = {
  warehouse_id?: number | string;
  warehouse_name?: string;
  opening_qty?: number | string;
  opening_amount?: number | string;
  purchase_qty?: number | string;
  purchase_amount?: number | string;
  received_qty?: number | string;
  received_amount?: number | string;
  sale_qty?: number | string;
  sale_amount?: number | string;
  transfer_qty?: number | string;
  transfer_amount?: number | string;
  adjustment_qty?: number | string;
  adjustment_amount?: number | string;
  ending_qty?: number | string;
  ending_amount?: number | string;
};

type RawResp = { data?: RawRow[] } | RawRow[];

const num = (v: number | string | undefined | null) => Number(v ?? 0) || 0;

function mapRow(r: RawRow): WarehouseMovement {
  return {
    warehouseId: String(r.warehouse_id ?? ''),
    warehouseName: r.warehouse_name ?? '',
    openingQty: num(r.opening_qty),
    openingAmount: num(r.opening_amount),
    purchaseQty: num(r.purchase_qty),
    purchaseAmount: num(r.purchase_amount),
    receivedQty: num(r.received_qty),
    receivedAmount: num(r.received_amount),
    saleQty: num(r.sale_qty),
    saleAmount: num(r.sale_amount),
    transferQty: num(r.transfer_qty),
    transferAmount: num(r.transfer_amount),
    adjustmentQty: num(r.adjustment_qty),
    adjustmentAmount: num(r.adjustment_amount),
    endingQty: num(r.ending_qty),
    endingAmount: num(r.ending_amount),
  };
}

export type StockSummaryQuery = { dateFrom: string; dateTo: string; branchId?: string };

/** GET /stock-summary?date_from=&date_to=&branch_id= — per-warehouse movement. */
export async function fetchStockSummary({
  dateFrom,
  dateTo,
  branchId,
}: StockSummaryQuery): Promise<WarehouseMovement[]> {
  const { data } = await api.get<RawResp>('/stock-summary', {
    params: { date_from: dateFrom, date_to: dateTo, branch_id: branchId || undefined },
  });
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list.map(mapRow);
}
