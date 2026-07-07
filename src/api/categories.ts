import { api } from '@/api/client';
import { getBaseUrl } from '@/api/config';

/** A category (or sub-category) the user can assign a product to. */
export type Category = {
  id: string;
  name: string;
  nameKh: string;
  type: string;
  image: string;
  subCategories: Category[];
};

/** A flat sub-category row for the picker. */
export type CategoryOption = {
  id: string;
  label: string;
  name: string;
  /** Name of the parent (main) category this sub-category belongs to. */
  parent: string;
};

type RawCategory = {
  id?: number | string;
  category_name?: string;
  category_name_kh?: string;
  type?: string;
  product_type?: string;
  image?: string | null;
  status?: string;
  sub_categories?: RawCategory[];
};

type RawResp = { status?: string; count?: number; data?: RawCategory[] } | RawCategory[];

function mapCategory(row: RawCategory): Category {
  return {
    id: String(row.id ?? ''),
    name: row.category_name ?? '',
    nameKh: row.category_name_kh ?? '',
    type: row.type ?? '',
    image: row.image ?? '',
    subCategories: (row.sub_categories ?? []).map(mapCategory),
  };
}

/**
 * GET /api/v1/categories?search={input}.
 *
 * This endpoint lives one level above the staff base URL (.../api/v1/staff),
 * so we resolve it against the api/v1 root by dropping the trailing `/staff`.
 */
export async function fetchCategories(search?: string): Promise<Category[]> {
  const url = getBaseUrl().replace(/\/staff\/?$/, '') + '/categories';
  const { data } = await api.get<RawResp>(url, {
    params: { search: search?.trim() || undefined },
  });
  const list = Array.isArray(data) ? data : (data.data ?? []);
  return list.map(mapCategory);
}

/** Flattens the tree into selectable rows — sub-categories only. */
export function toCategoryOptions(categories: Category[]): CategoryOption[] {
  const rows: CategoryOption[] = [];
  for (const cat of categories) {
    for (const sub of cat.subCategories) {
      rows.push({ id: sub.id, label: sub.name, name: sub.name, parent: cat.name });
    }
  }

  // Sub-category names can repeat across parents. The picker keys/selects by
  // label, so make duplicates unique by appending the parent category name.
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const row of rows) {
    if ((counts.get(row.name) ?? 0) > 1) {
      const base = row.parent ? `${row.name} · ${row.parent}` : row.name;
      // Guard against the (rare) case where even name + parent collides.
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      row.label = n > 1 ? `${base} (${n})` : base;
    }
  }

  return rows;
}
