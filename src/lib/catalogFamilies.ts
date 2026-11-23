import { isFixedPrice, type Product } from "../data/products";

export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const familyPhotos = import.meta.glob<string>("../assets/carta/*.webp", { eager: true, import: "default" });
export const price = (p: Product) => p.category === "frutafresh" && isFixedPrice(p.prices) ? p.prices.fijo : 0;
type Option = { label: string; rank: number; product: Product };
export type Family = { name: string; category: string; options: Option[] };

function describe(product: Product) {
  const raw = product.name.trim();
  const suffix = /\s+((?:vaso\s*)?(\d+)\s*(oz|lt|litros?)|vaso|gal[oó]n|por unidad|1 unidad|und|paquete\s+x\s*\d+)$/i.exec(raw);
  const base = suffix ? raw.slice(0,suffix.index) : raw;
  const key = fold(base);
  let name = base;
  let category = "Especialidades";
  if (/^(avena|avena cubana)$/.test(key)) { name = "Avena Cubana"; category = "Avenas"; }
  else if (/^(super )?sevillana$/.test(key)) { name = "Súper Sevillana"; category = "Sevillanas"; }
  else if (/^kumis( tradicional)?$/.test(key)) { name = "Kumis tradicional"; category = "Kumis"; }
  else if (/^yogur(t)?\b/.test(key)) { category = "Yogures"; name = base.replace(/^yogurt?\s+(de\s+)?/i,"Yogurt "); }
  else if (/acompan|antojo/.test(fold(product.categoryId || ""))) category = "Acompañantes";
  const amount = Number(suffix?.[2]);
  const oz = suffix?.[3]?.toLowerCase() === "oz";
  const label = amount ? (oz ? `Vaso ${amount} oz` : `${amount} ${amount===1?"litro":"litros"}`) : suffix?.[1] || "Presentación por confirmar";
  const rank = amount ? amount * (oz ? 30 : 1000) : 4000;
  return {name, category, option:{label,rank,product}};
}

export function familyImage(family: Family, item: Product) {
  const options = family.options;
  const photoKey = fold(family.name).replace(/\s+/g, "-");
  const familyPhoto = familyPhotos[`../assets/carta/${photoKey}.webp`];
  const catalogPhoto = item.image || options.find(o=>o.product.image)?.product.image;
  const customPhoto = options.find(({product}) => /^https?:\/\//i.test(product.image ?? ""))?.product.image;
  return (familyPhoto ? customPhoto || familyPhoto : catalogPhoto) || "/avena-cubana-logo.png";
}

export function groupCatalog(products: Product[]) {
  const families=new Map<string,Family>();
  for(const item of products){
    const {name,category,option}=describe(item);
    const key=category+"·"+fold(name);
    const family=families.get(key) || {name,category,options:[]};
    family.options.push(option);families.set(key,family);
  }
  for (const family of families.values()) family.options.sort((a, b) => a.rank - b.rank);
  return [...families.values()];
}

export type OfferKind = "bebida" | "acompañante";

export function productKind(product: Product): OfferKind | undefined {
  const { category } = describe(product);
  if (category === "Acompañantes") return "acompañante";
  if (category !== "Especialidades" || product.categoryId?.startsWith("bebida-")) return "bebida";
  if (product.categoryId?.startsWith("otro-")) return "acompañante";
}
