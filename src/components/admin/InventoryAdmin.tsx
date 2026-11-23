import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import ScrollableTable from "./ScrollableTable";
import { Boxes, Search, Plus, Pencil, ChevronLeft, ChevronRight } from "lucide-react";

type Item = { id: string; name: string; unit: string; quantity: number; minimum_quantity: number };
type Movement = { actor_email?: string; id: string; inventory_item_id: string; quantity_change: number; reason: string; created_at: string };
type Catalog = { id: string; name: string; price: number; available: boolean; item_type: string; category: string; image_url: string | null };
type Requirement = { inventory_item_id: string; catalog_item_id: string; quantity_required: number };
const empty = { name: "", unit: "unidad", minimum: "0", initial: "0" };

export default function InventoryAdmin({ staff = false }: { staff?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<"existencias" | "movimientos" | "ajustes">("existencias");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [status, setStatus] = useState("Todos");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [catalog, setCatalog] = useState<Catalog[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [form, setForm] = useState(empty);
  const [commercial, setCommercial] = useState({ price: "0", category: "", visible: false, expected: 0 });
  const [selected, setSelected] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [period, setPeriod] = useState("dia");
  const [movementType, setMovementType] = useState("todos");
  const [movementPage, setMovementPage] = useState(1);
  const [direction, setDirection] = useState<"entrada" | "salida">("entrada");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = async () => {
    if (!supabase) throw new Error("Supabase no está configurado.");
    const rows: Movement[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("inventory_movements")
        .select("id,inventory_item_id,quantity_change,reason,created_at,actor_email")
        .order("created_at", { ascending: false }).range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data as Movement[]));
      if (!data || data.length < 500) return rows;
    }
  };
  const load = async () => {
    if (!supabase) { setMessage("Supabase no está configurado."); return; }
    const [stock, history, products, linked] = await Promise.all([
      supabase.from("inventory_items").select("id,name,unit,quantity,minimum_quantity").order("name"),
      loadHistory().then(data => ({ data, error: null })).catch(error => ({ data: [], error })),
      staff ? Promise.resolve({ data: [], error: null }) : supabase.from("catalog_items").select("id,name,item_type,category,image_url,price,available").order("name"),
      staff ? Promise.resolve({ data: [], error: null }) : supabase.from("catalog_inventory_requirements").select("inventory_item_id,catalog_item_id,quantity_required"),
    ]);
    if (stock.error || history.error || products.error || linked.error) { setMessage(stock.error?.message || history.error?.message || products.error?.message || linked.error?.message || "No se pudo cargar el inventario."); return; }
    setItems(stock.data as Item[]); setMovements(history.data as Movement[]);
    setCatalog(products.data as Catalog[]); setRequirements(linked.data as Requirement[]);
  };
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("create_inventory_item", { p_name: form.name.trim(), p_unit: form.unit.trim(), p_minimum: Number(form.minimum), p_initial: Number(form.initial) });
    if (error) setMessage(error.message); else { setForm(empty); setMessage("Producto agregado al inventario."); await load(); setTab("existencias"); }
    setBusy(false);
  };
  const selectForEntry = (item: Item) => {
    setSelected(item.id);
    setMovementSearch(item.name);
    setDirection("entrada");
    setMessage("");
    setTab("movimientos");
  };
  const adjust = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || busy) return;
    const quantity = Number(amount);
    if (!selected || !Number.isFinite(quantity) || quantity <= 0 || !reason.trim()) { setMessage("Selecciona un insumo e indica cantidad y motivo."); return; }
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("adjust_inventory", { p_item_id: selected, p_change: direction === "entrada" ? quantity : -quantity, p_reason: reason.trim() });
    if (error) setMessage(error.message); else { setAmount(""); setReason(""); setMessage("Movimiento registrado."); await load(); }
    setBusy(false);
  };
  const saveDetails = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || !editing || staff || busy) return;
    setBusy(true); setMessage("");
    const minimum = Number(form.minimum);
    if (!Number.isFinite(minimum) || minimum < 0 || !form.name.trim() || !form.unit.trim()) { setMessage("Revisa el nombre, la unidad y el mínimo."); setBusy(false); return; }
    const { error } = await supabase.rpc("edit_inventory_product", {
      p_id: editing, p_name: form.name.trim(), p_unit: form.unit.trim(), p_minimum: minimum,
      p_quantity: Number(form.initial), p_expected: commercial.expected, p_price: Number(commercial.price),
      p_category: commercial.category.trim(), p_visible: commercial.visible
    });
    if (error) setMessage(error.message); else { setEditing(null); setForm(empty); setMessage("Datos del producto actualizados."); await load(); setTab("existencias"); }
    setBusy(false);
  };
  const beginEdit = (item: Item) => { const product = itemCatalog(item); if (!product) { setMessage("Falta vincular este producto al catálogo."); return; } setCommercial({ price: String(product.price), category: product.category, visible: product.available, expected: Number(item.quantity) }); setEditing(item.id); setForm({ name: item.name, unit: item.unit, minimum: String(item.minimum_quantity), initial: String(item.quantity) }); setMessage(""); setTab("ajustes"); };
  const startCreate = () => { setEditing(null); setForm(empty); setMessage(""); setTab("ajustes"); };
  const itemCatalog = (item: Item) => {
    const link = requirements.find(requirement => requirement.inventory_item_id === item.id);
    return catalog.find(product => product.id === link?.catalog_item_id);
  };
  const itemStatus = (item: Item) => Number(item.quantity) <= 0 ? "Agotado" : Number(item.quantity) <= Number(item.minimum_quantity) ? "Stock bajo" : "Disponible";
  const categories = Array.from(new Set(items.map(item => itemCatalog(item)?.category).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es"));
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const matchingMovementItems = items.filter(item =>
    normalize(`${item.name} ${item.unit}`).includes(normalize(movementSearch.trim()))
  );
  const dateKey = (value: Date) => value.toLocaleDateString("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dateKey(new Date());
  const startOfWeek = (key: string) => {
    const day = new Date(key + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
    return day.toISOString().slice(0, 10);
  };
  const filteredMovements = movements.filter(movement => {
    const day = dateKey(new Date(movement.created_at));
    const withinPeriod = period === "todos" || (period === "dia" && day === today)
      || (period === "semana" && startOfWeek(day) === startOfWeek(today))
      || (period === "mes" && day.slice(0, 7) === today.slice(0, 7))
      || (period === "ano" && day.slice(0, 4) === today.slice(0, 4));
    return withinPeriod && (movementType === "todos" || (movementType === "entrada" ? movement.quantity_change > 0 : movement.quantity_change < 0));
  });
  const movementPages = Math.max(1, Math.ceil(filteredMovements.length / 20));
  const visibleMovements = filteredMovements.slice((movementPage - 1) * 20, movementPage * 20);
  const filtered = items.filter(item => normalize(item.name).includes(normalize(query.trim())) && (category === "Todas" || itemCatalog(item)?.category === category) && (status === "Todos" || itemStatus(item) === status));
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  return <div className="inventory-page mx-auto max-w-7xl text-[#071e55]">
    <nav aria-label="Secciones de inventario" className="inventory-tabs flex gap-7 overflow-x-auto border-b border-[#c6e0ef]">{([{ id: "existencias", label: "Existencias" }, { id: "movimientos", label: "Movimientos" }, { id: "ajustes" as const, label: staff ? "Nuevo producto" : "Ajustes" }] as const).map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => { setTab(item.id); setMessage(""); }} className={`shrink-0 border-b-2 px-1 py-3 text-sm ${tab === item.id ? "border-[#087fc7] font-medium text-[#087fc7]" : "border-transparent text-[#526d80]"}`}>{item.label}</button>)}</nav>
    {message && <p role="status" className="mt-4 text-sm text-[#087fc7]">{message}</p>}
    {tab === "existencias" && <section className="pt-5">
      <div className="inventory-toolbar flex flex-wrap items-end gap-3"><label className="relative min-w-[14rem] flex-1"><span className="sr-only">Buscar producto</span><Search size={18} className="absolute left-3 top-3 text-[#526d80]" /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Buscar producto..." className="w-full rounded-full border border-[#b6d9ed] bg-white py-2.5 pl-10 pr-4 text-sm" /></label>{!staff && <label><span className="sr-only">Categoría</span><select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="rounded-full border border-[#b6d9ed] bg-white px-4 py-2.5 text-sm"><option value="Todas">Categoría: Todas</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}<label><span className="sr-only">Estado</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="rounded-full border border-[#b6d9ed] bg-white px-4 py-2.5 text-sm"><option value="Todos">Estado: Todos</option><option>Disponible</option><option>Stock bajo</option><option>Agotado</option></select></label>{<button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-full bg-[#087fc7] px-5 py-2.5 text-sm font-medium text-white"><Plus size={18} /> Nuevo producto</button>}<button type="button" onClick={() => { setTab("movimientos"); setMessage(""); }} className="inline-flex items-center gap-2 rounded-full border border-[#087fc7] px-5 py-2.5 text-sm font-medium text-[#087fc7]"><Plus size={18} /> Registrar entrada</button></div>
      <div className="mt-6"><ScrollableTable label="Existencias de inventario"><table><thead><tr><th>Producto</th><th>Unidad</th><th>Disponible</th><th>Mínimo</th><th>Estado</th>{!staff && <th>Acciones</th>}</tr></thead><tbody>{visible.map(item => { const product = itemCatalog(item); const label = itemStatus(item); return <tr key={item.id}><td><span className="flex items-center gap-3"><button type="button" onClick={() => selectForEntry(item)} aria-label={`Registrar entrada de ${item.name}`} className="flex items-center gap-3 text-left hover:text-[#087fc7]">{product?.image_url ? <img src={product.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[#e8f5fc] text-[#087fc7]"><Boxes size={19} /></span>}<span className="font-medium underline-offset-2 hover:underline">{item.name}</span></button></span></td><td>{item.unit}</td><td>{Number(item.quantity)}</td><td>{Number(item.minimum_quantity)}</td><td><span className={`inventory-status ${label === "Disponible" ? "is-available" : label === "Agotado" ? "is-empty" : "is-low"}`}><span aria-hidden="true">●</span> {label}</span></td>{!staff && <td><button type="button" onClick={() => beginEdit(item)} aria-label={`Editar ${item.name}`} title="Editar datos" className="p-2 text-[#087fc7]"><Pencil size={17} /></button></td>}</tr>; })}</tbody></table></ScrollableTable>{!visible.length && <p className="py-10 text-center text-sm text-[#526d80]">No encontramos productos con esos filtros.</p>}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-[#526d80]"><span>Mostrando {filtered.length ? (currentPage - 1) * 8 + 1 : 0}–{Math.min(currentPage * 8, filtered.length)} de {filtered.length} productos</span><div className="flex items-center gap-2"><button type="button" aria-label="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-full border border-[#b6d9ed] p-2 disabled:opacity-40"><ChevronLeft size={17} /></button><span className="px-2">{currentPage} / {pages}</span><button type="button" aria-label="Página siguiente" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-full border border-[#b6d9ed] p-2 disabled:opacity-40"><ChevronRight size={17} /></button></div></div>
    </section>}
    {tab === "movimientos" && <section className="inventory-forms space-y-8 pt-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={adjust}>
        <h3 className="mb-2 text-lg font-medium">Registrar {staff ? "entrada" : "movimiento"}</h3>
        <p className="mb-4 text-sm text-[#526d80]">{staff ? "Agrega unidades al inventario." : "Registra entradas o salidas manuales con su motivo."}</p>
        <div className="inventory-fields">
          <label className="inventory-wide">Buscar producto
            <input type="search" value={movementSearch} onChange={e => { setMovementSearch(e.target.value); setSelected(""); }} placeholder="Nombre o presentación, por ejemplo Kumis 1 Lt" autoComplete="off" />
          </label>
          {selected && <p className="inventory-wide text-sm font-semibold text-[#075e99]">Seleccionado: {items.find(item => item.id === selected)?.name}</p>}
          {!staff && <label>Tipo<select value={direction} onChange={e => setDirection(e.target.value as typeof direction)}><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label>}
          <label className="inventory-wide">Cantidad<input required type="text" inputMode="numeric" pattern="[0-9]+" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} placeholder="Unidades" /></label>
          <label className="inventory-wide">Motivo<input required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} placeholder="Compra, merma, ajuste..." /></label>
        </div>
        <button className="inventory-submit" disabled={busy || !selected}>Registrar {direction === "entrada" ? "entrada" : "salida"}</button>
      </form>
      <aside aria-label="Seleccionar producto" className="min-w-0 border-t border-[#c6e0ef] pt-4">
        <h3 className="mb-1 text-lg font-medium">Productos</h3>
        <p className="mb-3 text-sm text-[#526d80]">Selecciona el producto para registrar el movimiento.</p>
        <div className="inventory-product-results">
          {matchingMovementItems.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} className="inventory-product-card">
            <Boxes size={20} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.unit} · {Number(item.quantity)} disponibles</small></span>
          </button>)}
          {!matchingMovementItems.length && <p className="py-3 text-sm text-[#526d80]">No encontramos productos con esa búsqueda.</p>}
        </div>
      </aside>
      </div>
      <div className="border-t border-[#c6e0ef] pt-5">
        <h3 className="mb-4 text-lg font-medium">Historial de movimientos</h3>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="text-sm">Período<select aria-label="Período de movimientos" value={period} onChange={e => { setPeriod(e.target.value); setMovementPage(1); }} className="ml-2 border bg-white px-3 py-2"><option value="dia">Hoy</option><option value="semana">Esta semana</option><option value="mes">Este mes</option><option value="ano">Este año</option><option value="todos">Todo el historial</option></select></label>
          <label className="text-sm">Tipo<select aria-label="Tipo de movimiento" value={movementType} onChange={e => { setMovementType(e.target.value); setMovementPage(1); }} className="ml-2 border bg-white px-3 py-2"><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option></select></label>
        </div>
        {visibleMovements.length ? <div className="inventory-history">{visibleMovements.map(m => <div key={m.id}><span>{items.find(i => i.id === m.inventory_item_id)?.name || "Producto"}<small>{m.reason} · {m.actor_email || "Autor no registrado"} · {new Date(m.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" })}</small></span><strong className={m.quantity_change > 0 ? "text-green-700" : "text-amber-700"}>{Number(m.quantity_change) > 0 ? "+" : ""}{Number(m.quantity_change)}</strong></div>)}</div> : <p className="inventory-empty">No hay movimientos para estos filtros.</p>}
        {movementPages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={movementPage === 1} onClick={() => setMovementPage(n => n - 1)}>Anterior</button><span>{movementPage} / {movementPages}</span><button type="button" disabled={movementPage === movementPages} onClick={() => setMovementPage(n => n + 1)}>Siguiente</button></div>}
      </div>
    </section>}
    {tab === "ajustes" && (!staff || !editing) && <section className="inventory-forms grid gap-8 pt-6 lg:grid-cols-2"><form onSubmit={editing ? saveDetails : create}><h3 className="mb-3 text-lg font-medium">{editing ? "Editar datos del producto" : "Agregar al inventario"}</h3><p className="mb-4 text-sm text-[#526d80]">{editing ? "Los cambios de existencia quedan registrados en Movimientos." : "Al guardar se creará el producto en el catálogo para configurar su precio."}</p><div className="inventory-fields"><label>Nombre<input required maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Avena 1 litro" /></label><label>Unidad<input required maxLength={30} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="litro, unidad..." /></label>{<label>{editing ? "Existencia actual" : "Existencia inicial"}<input required type="number" min="0" step="0.001" value={form.initial} onChange={e => setForm({ ...form, initial: e.target.value })} /></label>}{editing && <><label>Precio<input type="number" min="0" required value={commercial.price} onChange={e => setCommercial({...commercial,price:e.target.value})}/></label><label>Categoría<input list="inventory-categories" required value={commercial.category} onChange={e=>setCommercial({...commercial,category:e.target.value})}/><datalist id="inventory-categories">{categories.map(c=><option key={c}>{c}</option>)}</datalist></label><label>Visible en carta<input type="checkbox" checked={commercial.visible} onChange={e=>setCommercial({...commercial,visible:e.target.checked})}/></label></>}<label>Existencia mínima<input required type="number" min="0" step="0.001" value={form.minimum} onChange={e => setForm({ ...form, minimum: e.target.value })} /></label></div><button className="inventory-submit" disabled={busy}>{editing ? "Guardar cambios" : "Agregar"}</button>{editing && <button type="button" onClick={startCreate} className="ml-4 text-sm text-[#087fc7] underline">Cancelar</button>}</form></section>}
  </div>;
}
