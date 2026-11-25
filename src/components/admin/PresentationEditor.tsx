import { useState } from "react";
import { describe, fold } from "../../lib/catalogFamilies";
import { supabase } from "../../lib/supabase";
import ProductCategorySelect from "./ProductCategorySelect";
import type { CatalogItem } from "./CatalogAdmin";

type Row = { key: string; id?: string; name: string; flavor: string; size: string; price: string };

export default function PresentationEditor({ items, close, saved, initialItemId }: { items: CatalogItem[]; close: () => void; saved: () => Promise<void>; initialItemId?: string }) {
  const initialItem = items.find(item => item.id === initialItemId);
  const initialFamily = initialItem ? (initialItem.family_name || describe(initialItem.name, initialItem.category).name) : '';
  const matching = (name: string) => items.filter(item => fold(item.family_name || describe(item.name, item.category).name) === fold(name));
  const toRow = (item: CatalogItem): Row => { const label = item.presentation_name || describe(item.name, item.category).label; return { key:item.id, id:item.id, name:item.name, flavor:item.flavor_name || '', size:fold(label).startsWith('presentacion por confirmar') ? '' : label, price:String(item.price) }; };
  const [family, setFamily] = useState(initialFamily);
  const [category, setCategory] = useState(initialItem?.category === 'Por configurar' ? '' : initialItem?.category ?? '');
  const [itemType, setItemType] = useState<CatalogItem["item_type"]>(initialItem?.item_type ?? "bebida");
  const [rows, setRows] = useState<Row[]>(() => initialItem ? matching(initialFamily).map(toRow) : []);
  const [loaded, setLoaded] = useState(Boolean(initialItem));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [existingId, setExistingId] = useState("");
  const names = [...new Set(items.map(item => (item.family_name || describe(item.name, item.category).name)))].sort((a, b) => a.localeCompare(b, "es"));

  const loadFamily = () => {
    const name = family.trim();
    if (!name) { setMessage("Escribe el nombre del producto."); return; }
    const matches = matching(name);
    setCategory(matches[0]?.category === "Por configurar" ? "" : matches[0]?.category ?? "");
    setItemType(matches[0]?.item_type ?? "bebida");
    setRows(matches.map(toRow));
    setFamily(name); setMessage(""); setLoaded(true);
  };
  const update = (key: string, change: Partial<Row>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  const save = async () => {
    if (!supabase || saving) return;
    const payload = rows.map(row => ({ id: row.id ?? null, name: row.id ? row.name : [family, row.flavor.trim(), row.size.trim()].filter(Boolean).join(' '), price: row.price, family, flavor: row.flavor.trim(), size: row.size.trim() }));
    if (!category.trim() || !rows.length || rows.some(row => (!row.id && !row.size.trim()) || !/^\d{1,9}$/.test(row.price))) {
      setMessage("Indica una categoría, al menos una presentación y un precio en pesos para cada una."); return;
    }
    if (new Set(payload.map(row => fold(row.name))).size !== payload.length) { setMessage("Hay presentaciones repetidas."); return; }
    const knownSizes = payload.filter(row => row.size);
    if (new Set(knownSizes.map(row => `${fold(row.flavor)}|${fold(row.size)}`)).size !== knownSizes.length) { setMessage("Cada combinación de sabor y tamaño debe ser diferente."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.rpc("configure_product_presentations", { p_category: category.trim(), p_item_type: itemType, p_rows: payload });
    if (error) setMessage(error.message);
    else { await saved(); close(); }
    setSaving(false);
  };
  return <div className="fixed inset-0 z-[80] flex justify-end bg-[#061d55]/40" role="dialog" aria-modal="true" aria-labelledby="presentation-title">
    <div className="h-full w-full max-w-2xl overflow-y-auto bg-[#f8fbff] p-6 shadow-xl">
      <h2 id="presentation-title" className="text-xl font-semibold">Configurar tamaños y precios</h2>
      <p className="mt-2 text-sm text-[#526d80]">Elige el producto que se verá en la carta. Agrega sus sabores y tamaños: cada combinación tiene su propio precio y existencia.</p><p className="mt-2 text-sm text-[#526d80]">Ejemplo: Yogurt frutal → Fresa → 1 litro; Yogurt griego sin sabor → 6 oz. Las presentaciones nuevas se crean ocultas hasta que las actives.</p>
      <label className="mt-5 block text-sm font-medium">Elegir producto existente<select value={names.includes(family) ? family : ''} onChange={e => { setFamily(e.target.value); setLoaded(false); }} className="mt-1 block w-full border bg-white px-3 py-2"><option value="">Selecciona un producto</option>{names.map(name => <option value={name} key={name}>{name}</option>)}</select></label>
      <label className="mt-3 block text-sm font-medium">O escribe un producto nuevo <input list="presentation-families" value={family} onChange={e => { setFamily(e.target.value); setLoaded(false); }} placeholder="Ej. Kumis Patiano" className="mt-1 block w-full border bg-white px-3 py-2" /></label>
      <datalist id="presentation-families">{names.map(name => <option value={name} key={name} />)}</datalist>
      <button type="button" onClick={loadFamily} className="mt-3 rounded-full border border-sky-600 px-4 py-2 text-sm text-sky-700">Cargar presentaciones</button>
      {loaded && <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm">Categoría<ProductCategorySelect value={category} onChange={setCategory} existing={items.map(item => item.category)} className="mt-1 block w-full border bg-white px-3 py-2" /></label><label className="text-sm">Tipo<select value={itemType} onChange={e => setItemType(e.target.value as CatalogItem["item_type"])} className="mt-1 block w-full border bg-white px-3 py-2"><option value="bebida">Bebida</option><option value="carta">Producto</option><option value="otro">Acompañante</option></select></label></div>
        <div className="mt-5 space-y-3">{rows.map(row => <div key={row.key} className="grid items-end gap-2 rounded-lg border border-sky-200 bg-white p-3 sm:grid-cols-[1fr_1fr_8rem_auto]"><label className="text-sm">Sabor (opcional)<input value={row.flavor} onChange={e => update(row.key, { flavor: e.target.value })} placeholder="Ej. Fresa" className="mt-1 block w-full border px-3 py-2" /></label><label className="text-sm">Tamaño o presentación<input value={row.size} onChange={e => update(row.key, { size: e.target.value })} placeholder="Ej. 12 oz" className="mt-1 block w-full border px-3 py-2" /></label><label className="text-sm">Precio ($)<input type="number" min="0" max="999999999" step="1" value={row.price} onChange={e => update(row.key, { price: e.target.value })} className="mt-1 block w-full border px-3 py-2" /></label><button type="button" onClick={() => setRows(current => current.filter(value => value.key !== row.key))} aria-label={`Quitar ${row.size || 'presentación nueva'} de esta edición`} className="min-h-11 px-2 text-sm text-red-700">Quitar</button>{row.id && <small className="text-slate-500 sm:col-span-4">{row.name} · se conserva su existencia y visibilidad</small>}</div>)}</div>
        <p className="mt-3 text-xs text-[#526d80]">Ejemplos: 6 oz, vaso 12 oz, 1 litro, galón o por unidad.</p>
        <label className="mt-4 block text-sm font-medium">Agregar un producto que ya existe<select value={existingId} onChange={e => setExistingId(e.target.value)} className="mt-1 block w-full border bg-white px-3 py-2"><option value="">Selecciona una presentación existente</option>{items.filter(item => !rows.some(row => row.id === item.id)).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <button type="button" disabled={!existingId} onClick={() => { const item = items.find(value => value.id === existingId); if (!item) return; setRows(current => [...current, toRow(item)]); setExistingId(''); }} className="mt-2 text-sm font-semibold text-sky-700 disabled:opacity-40">+ Agregar producto existente</button>
        <button type="button" onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), name: "", flavor: "", size: "", price: "" }])} className="mt-4 text-sm font-semibold text-sky-700">+ Agregar tamaño</button>
        <div className="mt-6"><button type="button" disabled={saving} onClick={() => void save()} className="rounded-full bg-sky-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar precios y tamaños"}</button></div>
      </>}
      {message && <p role="status" className="mt-4 text-sm text-red-700">{message}</p>}
      <button type="button" onClick={close} disabled={saving} className="mt-5 rounded-full border border-sky-200 px-5 py-2 text-sm">Cerrar</button>
    </div>
  </div>;
}
