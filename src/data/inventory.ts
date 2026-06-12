/**
 * Mock inventory store. In-memory backend for the product list, detail, edit,
 * create and delete flows. Replace the functions with real API calls later.
 */

export type ProductStatus = "active" | "inactive";

export type InventoryProduct = {
  id: string;
  code: string;
  name: string;
  nameKhmer: string;
  category: string;
  brand: string;
  stockType: string;
  barcode: string;
  cost: number;
  price: number;
  stock: number;
  reorderLevel: number;
  status: ProductStatus;
  description: string;
  descriptionKhmer: string;
  thumbnail: string;
  gallery: string[];
};

export const CATEGORIES = [
  "Lenses",
  "Frames",
  "Sunglasses",
  "Accessories",
  "Contact Lens",
];

export const BRANDS = [
  "M Optic",
  "Ray-Ban",
  "Oakley",
  "Essilor",
  "Local Brand",
];

export const STOCK_TYPES = ["Stock", "Service"];

export type StockLevel = "in" | "low" | "out";

export const STOCK_META: Record<StockLevel, { label: string; color: string }> =
  {
    in: { label: "In stock", color: "#30A46C" },
    low: { label: "Low stock", color: "#F5A623" },
    out: { label: "Out of stock", color: "#e5484d" },
  };

export function stockLevel(product: InventoryProduct): StockLevel {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.reorderLevel) return "low";
  return "in";
}

const BASE_PRODUCTS = [
  {
    code: "1.61GOLD-2.00/-0.25",
    name: "1.61 Gold AR Lens",
    category: "Lenses",
    cost: 45,
    price: 70,
  },
  {
    code: "1.56RED-0.00",
    name: "1.56 Red Coat Lens",
    category: "Lenses",
    cost: 35,
    price: 55,
  },
  {
    code: "1.56GOLD-0.00",
    name: "1.56 Gold Coat Lens",
    category: "Lenses",
    cost: 25,
    price: 42,
  },
  {
    code: "UV400-3.50",
    name: "UV400 Sun Lens",
    category: "Sunglasses",
    cost: 10,
    price: 22,
  },
  {
    code: "UV400-0.00",
    name: "UV400 Sun Lens",
    category: "Sunglasses",
    cost: 10,
    price: 20,
  },
  {
    code: "FRM-ACE-01",
    name: "Acetate Frame — Black",
    category: "Frames",
    cost: 18,
    price: 48,
  },
  {
    code: "FRM-MTL-02",
    name: "Metal Frame — Silver",
    category: "Frames",
    cost: 22,
    price: 60,
  },
  {
    code: "CL-DAILY-30",
    name: "Daily Contact Lens (30pk)",
    category: "Contact Lens",
    cost: 14,
    price: 30,
  },
  {
    code: "CL-MONTH-06",
    name: "Monthly Contact Lens (6pk)",
    category: "Contact Lens",
    cost: 20,
    price: 45,
  },
  {
    code: "ACC-CASE-01",
    name: "Hard Glasses Case",
    category: "Accessories",
    cost: 2,
    price: 6,
  },
  {
    code: "ACC-CLOTH-01",
    name: "Microfiber Cloth",
    category: "Accessories",
    cost: 1,
    price: 3,
  },
  {
    code: "ACC-SPRAY-01",
    name: "Lens Cleaning Spray",
    category: "Accessories",
    cost: 3,
    price: 8,
  },
];

function seed(): InventoryProduct[] {
  return BASE_PRODUCTS.flatMap((base, i) => {
    // Two stock variants per base product to give the list some volume.
    return [0, 1].map((variant) => {
      const index = i * 2 + variant;
      const stock = (index * 7) % 45; // 0..44, some land at 0 (out of stock)
      return {
        id: `prod-${1000 + index}`,
        code: variant === 0 ? base.code : `${base.code}-B`,
        name: base.name,
        nameKhmer: "",
        category: base.category,
        brand: BRANDS[index % BRANDS.length],
        stockType: "Stock",
        barcode: "",
        cost: base.cost,
        price: base.price,
        stock,
        reorderLevel: 10,
        status:
          index % 9 === 0
            ? ("inactive" as ProductStatus)
            : ("active" as ProductStatus),
        description: "",
        descriptionKhmer: "",
        thumbnail: "",
        gallery: [],
      };
    });
  });
}

let store: InventoryProduct[] = seed();

export type InventoryPage = {
  items: InventoryProduct[];
  total: number;
  totalPages: number;
  page: number;
};

export type InventoryQuery = {
  page: number;
  pageSize?: number;
  search?: string;
  category?: string | "all";
};

export function listProducts({
  page,
  pageSize = 8,
  search = "",
  category = "all",
}: InventoryQuery): InventoryPage {
  const term = search.trim().toLowerCase();
  let filtered = store;
  if (category !== "all") {
    filtered = filtered.filter((product) => product.category === category);
  }
  if (term) {
    filtered = filtered.filter(
      (product) =>
        product.code.toLowerCase().includes(term) ||
        product.name.toLowerCase().includes(term),
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

export function getProduct(id: string): InventoryProduct | undefined {
  return store.find((product) => product.id === id);
}

/** All products, used as the source for item pickers (e.g. stock transfers). */
export function getAllProducts(): InventoryProduct[] {
  return store;
}

export type CategoryStat = {
  category: string;
  products: number;
  units: number;
  value: number;
};

export type StockReport = {
  totalProducts: number;
  totalUnits: number;
  stockValue: number;
  retailValue: number;
  lowStock: number;
  outOfStock: number;
  active: number;
  byCategory: CategoryStat[];
  lowStockItems: InventoryProduct[];
};

/** Aggregates the current inventory into a stock report. */
export function getStockReport(): StockReport {
  let totalUnits = 0;
  let stockValue = 0;
  let retailValue = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let active = 0;
  const byCategory = new Map<string, CategoryStat>();

  for (const product of store) {
    totalUnits += product.stock;
    stockValue += product.cost * product.stock;
    retailValue += product.price * product.stock;
    if (product.status === "active") active += 1;

    const level = stockLevel(product);
    if (level === "low") lowStock += 1;
    if (level === "out") outOfStock += 1;

    const stat = byCategory.get(product.category) ?? {
      category: product.category,
      products: 0,
      units: 0,
      value: 0,
    };
    stat.products += 1;
    stat.units += product.stock;
    stat.value += product.cost * product.stock;
    byCategory.set(product.category, stat);
  }

  const lowStockItems = store
    .filter((product) => stockLevel(product) !== "in")
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  return {
    totalProducts: store.length,
    totalUnits,
    stockValue,
    retailValue,
    lowStock,
    outOfStock,
    active,
    byCategory: [...byCategory.values()].sort((a, b) => b.value - a.value),
    lowStockItems,
  };
}

export type ProductInput = {
  code: string;
  name: string;
  nameKhmer: string;
  category: string;
  brand: string;
  stockType: string;
  barcode: string;
  cost: number;
  price: number;
  stock: number;
  reorderLevel: number;
  status: ProductStatus;
  description: string;
  descriptionKhmer: string;
  thumbnail: string;
  gallery: string[];
};

export function addProduct(input: ProductInput): InventoryProduct {
  const product: InventoryProduct = { id: `prod-${Date.now()}`, ...input };
  store = [product, ...store];
  return product;
}

export function updateProduct(id: string, input: ProductInput): void {
  store = store.map((product) =>
    product.id === id ? { ...product, ...input } : product,
  );
}

export function deleteProduct(id: string): void {
  store = store.filter((product) => product.id !== id);
}

export function formatMoney(value: number) {
  return `${value.toFixed(2)} $`;
}
