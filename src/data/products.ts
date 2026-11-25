
export type Category = "gomitas" | "frutafresh";
export type Size = "pequeno" | "mediano" | "grande";
export type Version = "ahogada" | "picosa";

type BaseProduct = {
  id: string;
  dailyMenuId?: string;
  menuChoices?: { soup?: string; side?: string; protein?: string; special?: string };
  category: Category;
  categoryId?: string;
  familyName?: string;
  presentationName?: string;
  flavorName?: string;
  name: string;
  description: string;
  badge?: string;
  image?: string;
  disponible?: boolean;
};

type VersionedProduct = BaseProduct & {
  category: "gomitas";
  toppingsIncludedMax: number;
  sizes: Size[];
  prices: Record<Version, Record<Size, number>>;
};

export type FixedPriceMap = {
  fijo?: number;
  porSize?: Partial<Record<Size, number>>;
};

type MenuProduct = BaseProduct & {
  category: "frutafresh";
  toppingsIncludedMax?: number;
  sizes?: Size[];
  prices: FixedPriceMap;
};

export type Product = VersionedProduct | MenuProduct;

export function isFixedPrice(prices: FixedPriceMap): prices is { fijo: number } {
  return typeof prices.fijo === "number";
}

export const PRODUCTS: Product[] = [];
