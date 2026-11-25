import { useCallback, useEffect, useRef, useState } from "react";
import { type Product } from "../data/products";
import { supabase } from "../lib/supabase";

export type StoreCategory = { id: string; name: string; description?: string; image?: string };
type CatalogRow = { id: string; name: string; description: string; category: string; item_type: "carta" | "bebida" | "otro"; price: number; image_url: string | null; available: boolean; family_name?: string | null; presentation_name?: string | null; flavor_name?: string | null };

const normalize = (value: string) => value.trim().toLocaleLowerCase("es");
const slug = (value: string) => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function useStoreProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  const [connectionFailed, setConnectionFailed] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) { setError("No se pudo conectar con la carta."); return; }
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    const connectionError = () => {
      setConnectionFailed(true);
      setError("No pudimos conectar con la carta. Revisa tu conexión y vuelve a intentarlo.");
    };
    try {
      const { data, error: requestError, status } = await supabase.rpc("public_catalog_items")
        .order("category").order("name").abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      if (requestError) {
        if (status === 0) connectionError();
        else { setConnectionFailed(false); setError(requestError.message); }
        return;
      }
      const rows = (data ?? []) as CatalogRow[];
      const managed = rows.map((row): Product => ({
        id: row.id,
        category: "frutafresh",
        categoryId: `${row.item_type}-${slug(row.category)}`,
        name: row.name,
        familyName: row.family_name ?? undefined,
        presentationName: row.presentation_name ?? undefined,
        flavorName: row.flavor_name ?? undefined,
        description: row.description,
        image: row.image_url ?? undefined,
        disponible: row.available && row.price > 0,
        toppingsIncludedMax: 0,
        prices: { fijo: row.price },
      }));
      setProducts(managed);
      const unique = new Map<string, StoreCategory>();
      rows.forEach(row => unique.set(`${row.item_type}-${slug(row.category)}`, { id: `${row.item_type}-${slug(row.category)}`, name: row.item_type === "bebida" ? `Bebidas · ${row.category}` : row.category }));
      setCategories([...unique.values()]);
      setConnectionFailed(false);
      setError(null);
    } catch {
      if (!controller.signal.aborted) connectionError();
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void reload(); }, 0);
    return () => { window.clearTimeout(timer); currentRequest.current?.abort(); };
  }, [reload]);

  useEffect(() => {
    if (!connectionFailed) return;
    const retry = () => { void reload(); };
    const timer = navigator.onLine ? window.setTimeout(retry, 1500) : undefined;
    window.addEventListener("online", retry);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", retry); };
  }, [connectionFailed, reload]);
  return { products, categories, loading, error, reload };
}
