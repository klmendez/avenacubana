import { isFixedPrice, type Product } from "../data/products";

export const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const familyPhotos = import.meta.glob<string>("../assets/carta/*.webp", { eager: true, import: "default" });
export const price = (p: Product) => p.category === "frutafresh" && isFixedPrice(p.prices) ? p.prices.fijo : 0;
type Option = { label: string; rank: number; product: Product };
export type Family = { name: string; category: string; options: Option[] };

export function describe(productName: string, categoryId?: string) {
  const raw = productName.trim();
  const suffix = /\s+((?:vaso\s*)?(\d+)\s*(oz|lt|litros?)|vaso|gal[oó]n|por unidad|1 unidad|und|paquete\s+x\s*\d+)$/i.exec(raw);
  const base = suffix ? raw.slice(0,suffix.index) : raw;
  const key = fold(base);
  let name = base;
  let category = "Especialidades";
  if (/^(avena|avena cubana)$/.test(key)) { name = "Avena Cubana"; category = "Avenas"; }
  else if (/^(super )?sevillana$/.test(key)) { name = "Súper Sevillana"; category = "Sevillanas"; }
  else if (/^kumis\b/.test(key)) { name = /^kumis( tradicional)?$/.test(key) ? "Kumis tradicional" : base; category = "Kumis"; }
  else if (/^yogur(t)?\b/.test(key)) { category = "Yogures"; name = base.replace(/^yogurt?\s+(de\s+)?/i,"Yogurt "); }
  else if (/acompan|antojo/.test(fold(categoryId || ""))) category = "Acompañantes";
  const amount = Number(suffix?.[2]);
  const oz = suffix?.[3]?.toLowerCase() === "oz";
  const label = amount ? (oz ? `Vaso ${amount} oz` : `${amount} ${amount===1?"litro":"litros"}`) : suffix?.[1] || "Presentación por confirmar";
  const rank = amount ? amount * (oz ? 30 : 1000) : 4000;
  return { name, category, label, rank };
}

const presentationPhotos = import.meta.glob<string>("../assets/carta/presentaciones/*.webp", {
  eager: true, import: "default",
});
const generatedPhotos = import.meta.glob<string>("../assets/carta/generadas/*.png", {
  eager: true, import: "default",
});

export function catalogProductImage(productName: string, image?: string | null) {
  if (image && !image.startsWith("/productos/")) return image;

  const productKey = fold(productName);
  let generatedKey = "";
  if (/^kumis patiano\b/.test(productKey)) generatedKey = "kumis-patiano";
  else if (/^kumis sin azucar\b/.test(productKey)) generatedKey = "kumis-sin-azucar";
  else if (/^yogurt? cuchareable\b/.test(productKey)) {
    const flavor = ["fresa", "mora", "melocoton"].find(value => productKey.includes(value));
    if (flavor) generatedKey = `cuchareable-${flavor}`;
  } else if (/^yogurt? griego\b/.test(productKey)) {
    const size = productKey.match(/\b(6|12|16)\s*oz\b/)?.[1] ?? "12";
    generatedKey = `griego-${size}oz-v2`;
  }
  if (generatedKey) return generatedPhotos[`../assets/carta/generadas/${generatedKey}.png`];

  const presentation = describe(productName);
  const key = fold(presentation.name).replace(/\s+/g, "-");
  const label = fold(presentation.label);
  const size = label.replace(/^vaso\s+/, "").replace(/^paquete\s+/, "")
    .replace(/litros?$/, "l").replace(/\s+/g, "");
  const variant = presentationPhotos[`../assets/carta/presentaciones/${key}-${size}.webp`];
  if (variant) return variant;

  const familyPhoto = familyPhotos[`../assets/carta/${key}.webp`];
  if (familyPhoto && /^(vaso\b|por unidad$|1 unidad$|und$)/.test(label)) return familyPhoto;
  return image || familyPhoto || undefined;
}

export function groupCatalog(products: Product[]) {
  const families=new Map<string,Family>();
  for(const item of products){
    const {name,category,label,rank}=describe(item.name, item.categoryId);
    const key=category+"·"+fold(name);
    const family=families.get(key) || {name,category,options:[]};
    family.options.push({ label, rank, product: item });families.set(key,family);
  }
  for (const family of families.values()) family.options.sort((a, b) => a.rank - b.rank);
  return [...families.values()];
}

export type OfferKind = "bebida" | "acompañante";

export function productKind(product: Product): OfferKind | undefined {
  const { category } = describe(product.name, product.categoryId);
  if (category === "Acompañantes") return "acompañante";
  if (category !== "Especialidades" || product.categoryId?.startsWith("bebida-")) return "bebida";
  if (product.categoryId?.startsWith("otro-")) return "acompañante";
}
