import { api } from '@/api/client';
import { getBaseUrl, isApiConfigured } from '@/api/config';
import { BRANDS } from '@/data/inventory';

/** A product brand managed in the web dashboard. */
export type Brand = {
  id: string;
  name: string;
};

type RawBrand = {
  id?: number | string;
  name?: string;
  brand_name?: string;
};

type RawResp = { status?: string; data?: RawBrand[] } | RawBrand[];

/**
 * GET /api/v1/brands — the same list the web dashboard manages.
 *
 * Like categories, this endpoint lives one level above the staff base URL
 * (.../api/v1/staff), so we resolve it against the api/v1 root.
 */
export async function fetchBrands(): Promise<Brand[]> {
  if (!isApiConfigured()) {
    return BRANDS.map((name, i) => ({ id: String(i + 1), name }));
  }
  const url = getBaseUrl().replace(/\/staff\/?$/, '') + '/brands';
  const { data } = await api.get<RawResp>(url);
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list
    .map((row) => ({
      id: String(row.id ?? ''),
      name: row.name ?? row.brand_name ?? '',
    }))
    .filter((b) => b.id && b.name);
}
