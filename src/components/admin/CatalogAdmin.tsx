import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { uploadCatalogImage, validateCatalogImage } from "../../lib/catalogImage";

import ProductList from "./ProductList";
export type CatalogItem = {
  id: string; name: string; description: string; category: string;
  item_type: "carta" | "bebida" | "otro"; price: number;
  image_url: string | null; available: boolean;
};

const empty = { name: "", description: "", category: "", item_type: "carta" as CatalogItem["item_type"], price: "", image_url: "", available: true };

export default function CatalogAdmin({ productsOnly = false }: { productsOnly?: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [mode, setMode] = useState<"agregar" | "editar" | "eliminar" | null>(null);
  const [form, setForm] = useState<typeof empty>({ ...empty, item_type: productsOnly ? "bebida" : "carta" });
  const [editing, setEditing] = useState<string | null>(null);
  const [stockForm, setStockForm] = useState({ unit: "unidad", initial: "0", minimum: "0" });
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    const timer = window.setTimeout(() => setPreview(url), 0);
    return () => { window.clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [imageFile]);

  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("catalog_items").select("*").order("category").order("name");
    if (error) setMessage(error.message); else setItems(((data ?? []) as CatalogItem[]).filter(item => productsOnly || item.item_type !== "otro"));
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || saving) return;
    setMessage(""); setSaving(true);
    try {
      const imageUrl = imageFile ? await uploadCatalogImage(imageFile) : form.image_url.trim() || null;
      const payload = { name: form.name.trim(), description: form.description.trim(), category: form.category.trim(), item_type: form.item_type, price: Number(form.price), image_url: imageUrl, available: form.available, business: "la_tuba", updated_at: new Date().toISOString() };
      const query = editing ? supabase.from("catalog_items").update(payload).eq("id", editing) : supabase.rpc("create_avena_product", { p_name: payload.name, p_description: payload.description, p_category: payload.category, p_item_type: payload.item_type, p_price: payload.price, p_image_url: payload.image_url, p_available: payload.available, p_unit: stockForm.unit.trim(), p_initial: Number(stockForm.initial), p_minimum: Number(stockForm.minimum) });
      const { error } = await query;
      if (error) throw error;
      setForm({ ...empty, item_type: productsOnly ? "bebida" : "carta" }); setEditing(null); setStockForm({ unit: "unidad", initial: "0", minimum: "0" }); setImageFile(null); setPreview(""); setMessage("Producto guardado correctamente."); setMode(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el producto."); }
    finally { setSaving(false); }
  };

  const edit = (item: CatalogItem) => {
    setImageFile(null); setPreview(""); setMessage("");
    setMode("editar"); setEditing(item.id);
    setForm({ name: item.name, description: item.description, category: item.category, item_type: item.item_type, price: String(item.price), image_url: item.image_url ?? "", available: item.available });
  };

  const remove = async (id: string) => {
    const item = items.find(product => product.id === id);
    if (!supabase || !item || !confirm(`¿Retirar ${item.name} de la venta? Su historial y existencia se conservarán.`)) return;
    const { error } = await supabase.from("catalog_items").update({ available: false }).eq("id", id);
    if (error) setMessage(error.message); else { setMessage("Producto retirado de la venta. Puedes activarlo de nuevo al editarlo."); await load(); }
  };

  const chooseMode = (next: "agregar" | "editar" | "eliminar") => {
    setStockForm({ unit: "unidad", initial: "0", minimum: "0" }); setMode(next); setEditing(null); setImageFile(null); setPreview(""); setMessage("");
    setForm({ ...empty, item_type: productsOnly ? "bebida" : "carta" });
  };

  return <div className="avena-product-panel w-full min-w-0 text-[#071e55]">
    <ProductList items={items} create={() => chooseMode("agregar")} edit={edit} archive={remove}
      duplicate={item => { chooseMode("agregar"); setForm({ ...item, name: item.name + " (copia)", price: String(item.price), image_url: item.image_url ?? "", available: false }); }} />    {(mode === "agregar" || (mode === "editar" && editing)) && <div className="fixed inset-0 z-[80] flex justify-end bg-[#061d55]/40"><form onSubmit={save} className="h-full w-full max-w-2xl overflow-y-auto bg-[#f8fbff] p-6 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4"><h3 className="text-lg font-medium">{editing ? "Editar producto" : "Agregar producto"}</h3>{editing && <button type="button" onClick={() => { setEditing(null); setImageFile(null); setPreview(""); }} className="text-sm text-[#087fc7] underline">Elegir otro producto</button>}</div>
      <p className="mb-5 text-sm text-[#526d80]">Cada producto tiene su propia existencia, creada automáticamente en Inventario. Para habilitar la compra, asigna un precio mayor que cero.</p>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Configurar producto por tipo
          <select value="" onChange={e => {
            const base = e.target.value;
            if (base) setForm(current => ({ ...current, name: base, category: base.startsWith("Yogurt ") ? "Yogurt frutal" : base, item_type: "bebida" }));
          }} className="mt-1 block w-full border border-sky-200 bg-white px-3 py-2">
            <option value="">Elegir tipo o sabor para el nombre</option>
            <optgroup label="Bebidas">{["Avena Cubana","Sevillana","Kumis"].map(name => <option key={name}>{name}</option>)}</optgroup>
            <optgroup label="Yogurt">{["Maracumango","Fresa","Melocotón","Mora","Frutos rojos","Ron con pasas","Arequipe con pasas","Piña"].map(flavor => <option key={flavor} value={'Yogurt ' + flavor}>{flavor}</option>)}</optgroup>
          </select>
        </label>
        <label className="text-sm font-medium">Nombre completo con presentación<input placeholder="Ej. Yogurt Fresa vaso 10 oz" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <label className="text-sm font-medium">Tipo<select value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value as CatalogItem["item_type"] })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal"><option value="carta">Producto</option><option value="bebida">Bebida</option><option value="otro">Acompañante</option></select></label>
        <label className="text-sm font-medium">Categoría<input required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ej. Yogurt frutal" className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <label className="text-sm font-medium">Precio<input required min="0" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label>
        {!editing && <><label className="text-sm font-medium">Unidad<input required maxLength={30} value={stockForm.unit} onChange={e => setStockForm({ ...stockForm, unit: e.target.value })} placeholder="Vaso, litro, unidad..." className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Existencia inicial<input required type="number" min="0" step="0.001" value={stockForm.initial} onChange={e => setStockForm({ ...stockForm, initial: e.target.value })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label><label className="text-sm font-medium">Existencia mínima<input required type="number" min="0" step="0.001" value={stockForm.minimum} onChange={e => setStockForm({ ...stockForm, minimum: e.target.value })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label></>}
        <label className="text-sm font-medium sm:col-span-2">Descripción<input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 block w-full border border-[#b6d9ed] bg-white px-3 py-2.5 text-sm font-normal" /></label>
        <div className="sm:col-span-2"><label className="block text-sm font-medium">Foto del producto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; if (!file) return; try { validateCatalogImage(file); setImageFile(file); setMessage(""); } catch (error) { e.target.value = ""; setMessage(error instanceof Error ? error.message : "Imagen no válida."); } }} className="mt-2 block w-full text-sm font-normal" /></label><p className="mt-1 text-xs text-[#526d80]">JPG, PNG o WebP, hasta 20 MB.</p>{(imageFile ? preview : form.image_url) && <img src={imageFile ? preview : form.image_url} alt="Vista previa del producto" className="mt-3 h-28 w-28 object-cover" />}{(imageFile || form.image_url) && <button type="button" onClick={() => { setImageFile(null); setPreview(""); setForm(current => ({ ...current, image_url: "" })); }} className="mt-2 block text-sm text-[#087fc7] underline">Quitar foto</button>}</div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.available} onChange={e => setForm({ ...form, available: e.target.checked })} /> Visible en el catálogo</label><button disabled={saving} className="inline-flex items-center gap-2 bg-[#086bb1] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"><Plus size={16} />{saving ? "Guardando..." : editing ? "Guardar cambios" : "Agregar producto"}</button></div>
    <button type="button" onClick={() => { setMode(null); setEditing(null); }} className="mt-4 rounded-full border border-[#b6d9ed] px-5 py-2 text-sm">Cancelar</button></form></div>}
    {message && <p role="status" className="mt-3 text-sm text-[#087fc7]">{message}</p>}
  </div>;
}
