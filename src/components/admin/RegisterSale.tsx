import { catalogProductImage } from "../../lib/catalogFamilies";
import { paymentMethodLabel } from '../../data/constants';
﻿import SaleTicket, { type Ticket } from "./SaleTicket";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Coffee, Sandwich, Search, ShoppingBag, ShoppingCart, Store, Bike, Trash2, Zap } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { OrderService } from "../../services/orderService";
import { ClientService, normalizePhone, type ContactLookup } from "../../services/clientService";
import { completeSubmission } from "../../lib/submission";
import { cop } from "../../lib/format";
import { useServerQuote } from "../../hooks/useServerQuote";
import { getBasePrice } from "../../lib/pricing";
import type { OrderItem, Service } from "../../lib/whatsapp";

import "./CashierSale.css";

type SaleType = "menu_dia" | "carta" | "bebida" | "otro";
type SaleItem = { id: string; name: string; price: number; category: string; qty: number; type: SaleType; dailyMenuId?: string; special?: string; image_url?: string | null; quantity: number; minimum_quantity: number; unit: string };
type DeliveryZone = { id: string; name: string; price: number | null };

export default function RegisterSale({ staff = false, orderOnly = false, cashier = false }: { staff?: boolean; orderOnly?: boolean; cashier?: boolean }) {
  const [params] = useSearchParams();
  const additionOrderId = params.get('agregar');
  const additionRequest = useRef<{ payload: string; id: string } | null>(null);
  const initialTable = params.get('mesa');
  const tableFromLink = initialTable && ['1','2','3','4','5'].includes(initialTable) ? initialTable : '';
  const [ticket,setTicket] = useState<Ticket | null>(null);
  const [category, setCategory] = useState("Todas");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [generic, setGeneric] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactLookup[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactLookup | null>(null);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [contactSearchError, setContactSearchError] = useState("");
  const [payment, setPayment] = useState<"Efectivo" | "Transferencia">("Efectivo");
  const [service, setService] = useState<Service>(tableFromLink ? "local" : "llevar");
  const [tableNumber, setTableNumber] = useState(tableFromLink);
  const [address, setAddress] = useState("");
  const [reference, setReference] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zoneError, setZoneError] = useState("");
  const [collectNow, setCollectNow] = useState<boolean | null>(orderOnly ? false : null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const selected = useMemo(() => items.filter(item => item.qty > 0), [items]);
  const saleRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cartRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!cashier) return;
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [cashier]);
  const shortcuts = [
    { pattern: /avena.*vaso/i, label: 'Avena vaso', icon: Coffee },
    { pattern: /sevillana.*vaso/i, label: 'Sevillana vaso', icon: Coffee },
    { pattern: /kumis.*vaso/i, label: 'Kumis vaso', icon: Coffee },
    { pattern: /almoj[aá]bana/i, label: 'Almojábana', icon: Sandwich },
  ].flatMap(shortcut => {
    const matches = items.filter(item => shortcut.pattern.test(item.name));
    const item = matches.find(item => item.quantity > 0) ?? matches[0];
    return item ? [{ ...shortcut, item }] : [];
  });
  const tabsRef = useRef<HTMLElement>(null);
  const groups = useMemo(() => {
    const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = fold(productSearch.trim());
    const byCategory = new Map<string, SaleItem[]>();
    for (const item of items) {
      if (!fold(item.name + ' ' + item.category).includes(query)) continue;
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category)!.push(item);
    }
    return [...byCategory].sort(([a], [b]) =>
      Number(fold(a) === 'acompanantes') - Number(fold(b) === 'acompanantes') || a.localeCompare(b, 'es'));
  }, [items, productSearch]);

  useEffect(() => {
    const sale = saleRef.current;
    const tabs = tabsRef.current;
    const header = sale?.closest('.admin-main')?.querySelector<HTMLElement>('.admin-page-header');
    if (!sale || !tabs || !header) return;
    const sections = Array.from(sale.querySelectorAll<HTMLElement>('[data-sale-category]'));
    let frame = 0;
    const sync = () => {
      const line = tabs.getBoundingClientRect().bottom + 24;
      const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= line).at(-1);
      setCategory(current?.dataset.saleCategory ?? 'Todas');
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(sync); };
    const resize = new ResizeObserver(() => {
      sale.style.setProperty('--sale-header', header.offsetHeight + 'px');
      sale.style.setProperty('--sale-tabs', tabs.offsetHeight + 'px');
      schedule();
    });
    for (const element of [header, tabs, sale]) resize.observe(element);
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { resize.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); };
  }, [groups]);

  useEffect(() => {
    const tabs = tabsRef.current;
    const active = tabs?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!tabs || !active) return;
    const rect = active.getBoundingClientRect();
    const strip = tabs.getBoundingClientRect();
    if (rect.left < strip.left || rect.right > strip.right) tabs.scrollLeft += rect.left - strip.left - (strip.width - rect.width) / 2;
  }, [category, groups]);

  function goToCategory(name: string) {
    const sale = saleRef.current;
    const tabs = tabsRef.current;
    if (!sale || !tabs) return;
    const section = Array.from(sale.querySelectorAll<HTMLElement>('[data-sale-category]')).find(el => el.dataset.saleCategory === name);
    const top = (section ?? sale).getBoundingClientRect().top - parseFloat(getComputedStyle(tabs).top) - (section ? tabs.offsetHeight : 0);
    window.scrollTo({ top: window.scrollY + top, behavior: 'instant' });
  }
  const orderItems: OrderItem[] = useMemo(() => selected.map(item => ({ id: item.id, product: { id: item.dailyMenuId ?? item.id, ...(item.dailyMenuId ? { dailyMenuId: item.dailyMenuId, menuChoices: item.special ? { special: item.special } : {} } : {}), name: item.name, description: item.category, category: "frutafresh", categoryId: item.type === "menu_dia" ? "menu-del-dia" : `${item.type}-${item.category}`, toppingsIncludedMax: 0, prices: { fijo: item.price } }, qty: item.qty, version: null, size: null, toppingIds: [], extrasQty: {}, extraSelections: {} })), [selected]);
  const selectedZone = zones.find(zone => zone.id === zoneId);
  const quote = useServerQuote({ items: orderItems, servicio: service, canal: 'admin', cliente: service === 'domicilio' ? { barrioId: zoneId, barrio: selectedZone?.name ?? '', direccion: address.trim() } : {} });
  const total = quote.data?.total ?? selected.reduce((sum, item) => sum + item.price * item.qty, 0);

  useEffect(() => {
    let active = true;
    const query = contactQuery.trim();
    const timer = window.setTimeout(async () => {
      if (query.length < 2) { setContactResults([]); setSearchingContacts(false); setContactSearchError(""); return; }
      setSearchingContacts(true); setContactSearchError("");
      try {
        const results = await ClientService.searchContactsForOrder(query);
        if (active) setContactResults(results);
      } catch (error) {
        if (active) { setContactResults([]); setContactSearchError(error instanceof Error ? error.message : "No se pudo buscar contactos."); }
      } finally { if (active) setSearchingContacts(false); }
    }, query.length < 2 ? 0 : 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [contactQuery]);

  useEffect(() => {
    if (service !== 'domicilio') return;
    let active = true;
    const load = async () => {
      if (!supabase) { if (active) setZoneError('No se pudo conectar con Supabase.'); return; }
      const { data, error } = await supabase.from('delivery_zones').select('id,name,price').eq('active', true).order('name');
      if (!active) return;
      if (error) { setZones([]); setZoneError('No se pudieron cargar las zonas de domicilio.'); }
      else { setZones(data ?? []); setZoneError(''); }
    };
    void load();
    return () => { active = false; };
  }, [service]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!supabase) throw new Error("No se pudo conectar con Supabase.");
        const result = await supabase.rpc("sale_catalog");
        if (result.error) throw result.error;
        if (!active) return;
        setItems(((result.data ?? []) as (Omit<SaleItem, "type" | "qty"> & { item_type: SaleType })[]).map(item => ({ ...item, image_url: catalogProductImage(item.name, item.image_url), type: item.item_type, qty: 0 })));
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "No se pudieron cargar los productos."); }
    };
    void load();
    return () => { active = false; };
  }, [catalogRevision]);

  const changeQty = (id: string, change: number) => setItems(current => current.map(item => item.id === id ? { ...item, qty: Math.min(Number(item.quantity), Math.max(0, item.qty + change)) } : item));
  const save = async () => {
    if (saving.current) return;
    const cleanPhone = normalizePhone(phone);
    const paidNow = !orderOnly && collectNow === true;
    if (!additionOrderId && !orderOnly && collectNow === null) { setMessage("Selecciona cuándo se cobra el pedido."); return; }
    if (!selected.length) { setMessage("Agrega al menos un producto."); return; }
    if (!additionOrderId && (name.trim() || cleanPhone) && (!name.trim() || !/^3\d{9}$/.test(cleanPhone))) { setMessage("Para asociar un cliente, indica su nombre y celular de 10 dígitos."); return; }
    if (!additionOrderId && !generic && !name.trim()) { setMessage("Indica el nombre y celular o selecciona Cliente genérico."); return; }
    if (service === 'local' && !['1','2','3','4','5'].includes(tableNumber)) { setMessage('Selecciona una mesa del 1 al 5.'); return; }
    if (service === 'domicilio' && (!address.trim() || !selectedZone || selectedZone.price === null)) { setMessage('Indica la dirección y un barrio con tarifa de domicilio.'); return; }
    if (!quote.data) { setMessage(quote.error || "Espera mientras se actualizan los precios."); return; }
    const types = new Set(selected.map(item => item.type));
    const saleType = types.size === 1 ? selected[0].type : 'mixto';
    saving.current = true; setBusy(true); setMessage(""); setCreatedOrderId(null);
    try {
      if (additionOrderId) {
        if (!supabase) throw new Error("No se pudo conectar con Supabase.");
        const payload = JSON.stringify(orderItems);
        if (additionRequest.current?.payload !== payload) additionRequest.current = { payload, id: crypto.randomUUID() };
        const { error } = await supabase.rpc('add_table_order_items', { p_order_id: additionOrderId, p_items: orderItems, p_request_id: additionRequest.current.id });
        if (error) throw error;
        additionRequest.current = null;
        setItems(current => current.map(item => ({ ...item, qty: 0 })));
        setCatalogRevision(value => value + 1);
        setMessage("Productos agregados a la cuenta.");
        return;
      }
      const numeroOrden = OrderService.generateOrderNumber();
      const orderId = await OrderService.createOrder({ numeroOrden, items: orderItems, total: quote.data.total, subtotal: quote.data.subtotal, delivery: quote.data.delivery, cliente: { nombres: name.trim() || "Consumidor final", celular: cleanPhone, direccion: service === 'domicilio' ? address.trim() : '', ...(service === 'local' ? { mesa: Number(tableNumber) } : {}), ...(service === 'domicilio' && selectedZone ? { barrioId: selectedZone.id, barrio: selectedZone.name, ...(reference.trim() ? { referencia: reference.trim() } : {}) } : {}) }, formaPago: payment, servicio: service, estado: paidNow ? "pagado" : "no_pagado", comentarios: "Pedido tomado desde administración", promociones: quote.data.promociones, descuentoTotal: quote.data.descuentoTotal, tipoVenta: saleType, canal: "admin" });
      completeSubmission("order");
      const receipt = JSON.parse(sessionStorage.getItem("avena-cubana-order-receipt") || "null") as { order_number?: string } | null;
      setMessage(`Pedido ${receipt?.order_number || numeroOrden} ${paidNow ? "registrado y cobrado" : "registrado, pendiente de pago"}.`);
      setCreatedOrderId(orderId);
      setTicket(paidNow ? { number: receipt?.order_number || numeroOrden, date: new Date(), customer: name.trim() || "Consumidor final", payment, paid: true, quote: quote.data } : null);
      setCatalogRevision(value => value + 1); setItems(current => current.map(item => ({ ...item, qty: 0 }))); setGeneric(true); setName(""); setPhone(""); setSelectedContact(null); setContactQuery(""); setService('llevar'); setCollectNow(orderOnly ? false : null); setTableNumber(''); setAddress(''); setReference(''); setZoneId('');
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo registrar la venta."); }
    finally { saving.current = false; setBusy(false); }
  };

  const catalogControls = <>
    <nav ref={tabsRef} aria-label="Categorías de productos" className="sale-category-tabs mb-5 flex gap-5 overflow-x-auto border-b border-[#086bb1]/20">{["Todas", ...groups.map(([name]) => name)].map(name => <button key={name} type="button" aria-current={category === name ? "location" : undefined} onClick={() => goToCategory(name)} className={`shrink-0 border-b-2 px-1 py-3 text-sm font-medium ${category === name ? "border-[#086bb1] text-[#061d70]" : "border-transparent text-[#526d80]"}`}>{name}{items.some(item => item.qty > 0 && (name === "Todas" || item.category === name)) && <span className="ml-1">· {items.filter(item => name === "Todas" || item.category === name).reduce((sum, item) => sum + item.qty, 0)}</span>}</button>)}</nav>
    <label className="relative mb-5 block"><span className="sr-only">Buscar producto</span><Search size={19} className="absolute left-4 top-3 text-[#526d80]" /><input ref={searchRef} value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Buscar producto..." className="w-full rounded-full border border-[#b6d9ed] bg-white py-2.5 pl-12 pr-4 text-sm" />{cashier && <kbd className="cash-sale-key">Ctrl + K</kbd>}</label>
  </>;
  return <div ref={saleRef} className={`register-sale mx-auto text-[#071e55] ${cashier ? 'cash-sale' : 'max-w-5xl'}`}>
    {ticket && <SaleTicket ticket={ticket}/>}
    {additionOrderId && <div className="mb-4 rounded-lg bg-sky-100 p-4">
      <strong>Agregar productos a la cuenta de la mesa {tableFromLink}</strong>
      <p>Selecciona los productos adicionales y agr?galos a la cuenta pendiente.</p>
      <Link to={staff ? "/admin?seccion=mesas" : "/admin?seccion=pedidos"} className="text-sm underline">Volver a mesas</Link>
    </div>}

    {!cashier && catalogControls}
    <div className={cashier ? "cash-sale-layout" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]"}>
      <div className="divide-y divide-[#086bb1]/15 border-y border-[#086bb1]/20">
        {cashier && <>
          {catalogControls}
          <button type="button" className="cash-sale-jump" onClick={() => cartRef.current?.scrollIntoView({ block: 'start' })}>Ver venta actual · {cop(total)}</button>
          {!!shortcuts.length && !productSearch.trim() && <section className="cash-sale-frequent">
            <h3><Zap size={19} />Productos frecuentes</h3>
            <div>{shortcuts.map(({ label, item, icon: Icon }) =>
              <button key={item.id} type="button" title={item.name} aria-label={`Agregar ${item.name}`} disabled={item.qty >= item.quantity} onClick={() => changeQty(item.id, 1)}>
                <Icon size={18} />{label}
              </button>)}</div>
          </section>}
        </>}
        {groups.map(([name, products]) => <section key={name} data-sale-category={name}>
          <h3 className="border-b border-sky-200 py-3 text-lg font-semibold">{name}</h3>
          <div className="divide-y divide-sky-100">{products.map(item => { const stock = Number(item.quantity); const state = stock <= 0 ? "Agotado" : stock <= Number(item.minimum_quantity) ? "Stock bajo" : "Disponible"; return <div key={item.id} className="flex flex-wrap items-center gap-3 px-1 py-4 sm:flex-nowrap">{item.image_url ? <img src={item.image_url} alt="" className="h-14 w-14 shrink-0 object-contain" /> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#e8f5fc] text-[#087fc7]"><ShoppingCart size={22} /></div>}<span className="min-w-0 flex-1"><span className="block font-medium">{item.name}</span><small className="text-[#526d80]">{item.unit} · {cop(item.price)}</small></span><span className={`sale-stock ${state === "Agotado" ? "is-empty" : state === "Stock bajo" ? "is-low" : "is-available"}`}>{state}{stock > 0 ? ` (${stock})` : ""}</span><div className="ml-auto flex items-center gap-2"><button type="button" aria-label={`Quitar una unidad de ${item.name}`} disabled={item.qty === 0} onClick={() => changeQty(item.id, -1)} className="h-10 w-10 rounded-lg border border-[#8ac9ed] text-[#087fc7] disabled:opacity-40">−</button><span className="w-6 text-center" aria-label={`${item.qty} unidades`}>{item.qty}</span><button type="button" aria-label={`Agregar una unidad de ${item.name}`} disabled={item.qty >= stock} onClick={() => changeQty(item.id, 1)} className="h-10 w-10 rounded-lg bg-[#086bb1] text-white disabled:opacity-35">+</button></div></div>; })}</div></section>)}
        {!groups.length && <p className="px-2 py-10 text-center text-sm text-[#526d80]">{productSearch.trim() ? "No encontramos productos con ese nombre." : "No hay productos disponibles en esta categoría."}</p>}
      </div>
      <aside ref={cartRef} className="border-t border-[#086bb1]/30 py-5 lg:sticky lg:top-28 lg:self-start">
        <h3 className="flex items-center gap-2 text-xl font-medium"><ShoppingCart size={22} className="text-[#087fc7]" /> Venta actual <span className="ml-auto text-xs text-[#526d80]">{selected.reduce((sum, item) => sum + item.qty, 0)} productos</span></h3>
        {!cashier && selected.length > 0 && <div className="mt-4 border-y border-[#086bb1]/20 py-3"><p className="text-xs font-medium uppercase text-[#526d80]">En el pedido</p>{selected.map(item => { const quoted = quote.data?.items.find(line => line.id === item.id); const price = quoted ? getBasePrice(quoted.product, null, null) : item.price; return <div key={item.id} className="mt-2 flex justify-between gap-3 text-sm"><span>{item.qty} × {item.name}</span><span className="ml-auto shrink-0">{cop(price * item.qty)}</span><button type="button" aria-label={`Quitar ${item.name} de la venta`} onClick={() => changeQty(item.id, -item.qty)} className="p-1 text-[#526d80]"><Trash2 size={16} /></button></div>; })}</div>}
        {!additionOrderId && <><fieldset className="mt-4 flex flex-wrap gap-4 text-sm"><legend className="mb-2 font-semibold">Cliente del pedido</legend>
          <label><input type="radio" checked={generic} onChange={() => { setGeneric(true); setName(""); setPhone(""); setSelectedContact(null); setContactQuery(""); }} /> Cliente genérico</label>
          <label><input type="radio" checked={!generic} onChange={() => setGeneric(false)} /> Identificar cliente</label>
        </fieldset>
        {!generic && <><label className="mt-4 block text-xs font-semibold uppercase">Buscar cliente o prospecto<input value={contactQuery} onChange={event => { const value = event.target.value; setContactQuery(value); setContactResults([]); setSearchingContacts(value.trim().length >= 2); setContactSearchError(""); }} placeholder="Nombre o celular" className="mt-2 w-full border bg-white px-3 py-2 normal-case" /></label>
        {searchingContacts && <p className="mt-2 text-xs text-[#526d80]">Buscando contactos…</p>}
        {contactSearchError && <p role="alert" className="mt-2 text-xs text-red-700">{contactSearchError}</p>}
        {contactQuery.trim().length >= 2 && !searchingContacts && !contactSearchError && <div className="mt-2 max-h-48 overflow-y-auto border bg-white" aria-label="Resultados de clientes y prospectos">
          {contactResults.length ? contactResults.map(contact => <button key={contact.id} type="button" onClick={() => { setSelectedContact(contact); setName(contact.nombres); setPhone(normalizePhone(contact.celular)); setContactQuery(""); setContactResults([]); }} className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-[#f3dfbd]"><b className="block">{contact.nombres}</b><span className="text-xs text-[#526d80]">{normalizePhone(contact.celular)} · {contact.totalPedidos > 0 ? "Cliente" : "Prospecto"}</span></button>) : <p className="px-3 py-2 text-xs text-[#526d80]">Sin coincidencias. Puedes escribir los datos de una persona nueva.</p>}
        </div>}
        {selectedContact && <p className="mt-3 text-xs text-[#36613a]">{selectedContact.totalPedidos > 0 ? "Cliente" : "Prospecto"} seleccionado: {selectedContact.nombres}. <button type="button" onClick={() => setSelectedContact(null)} className="font-semibold underline">Cambiar</button></p>}
        <label className="mt-4 block text-xs font-semibold uppercase">Nombre del cliente<input readOnly={!!selectedContact} value={name} onChange={event => setName(event.target.value)} className="mt-2 w-full border bg-white px-3 py-2 read-only:bg-[#f5ebd8]" /></label>
        <label className="mt-4 block text-xs font-semibold uppercase">Celular del cliente<input readOnly={!!selectedContact} inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="3XX XXX XXXX" className="mt-2 w-full border bg-white px-3 py-2 read-only:bg-[#f5ebd8]" /></label>
        </>}
        <fieldset className="mt-5 space-y-2 text-sm"><legend className="mb-2 text-xs font-semibold uppercase">{cashier ? 'Tipo de pedido' : '¿Cómo recibe el pedido?'}</legend>
          <label className="flex items-center gap-2"><input type="radio" name="saleService" checked={service === 'local'} onChange={() => setService('local')} /> {cashier && <Store size={17} />} En el lugar</label>
          <label className="flex items-center gap-2"><input type="radio" name="saleService" checked={service === 'llevar'} onChange={() => setService('llevar')} /> {cashier && <ShoppingBag size={17} />} Para llevar</label>
          <label className="flex items-center gap-2"><input type="radio" name="saleService" checked={service === 'domicilio'} onChange={() => setService('domicilio')} /> {cashier && <Bike size={17} />} Domicilio</label>
        </fieldset>
        {service === 'local' && <label className="mt-4 block text-sm font-medium">Número de mesa<select required value={tableNumber} onChange={event => setTableNumber(event.target.value)} className="mt-2 w-full border bg-white px-3 py-2"><option value="">Seleccionar mesa</option>{[1, 2, 3, 4, 5].map(number => <option key={number} value={number}>Mesa {number}</option>)}</select></label>}
        {service === 'domicilio' && <><label className="mt-4 block text-xs font-semibold uppercase">Barrio<select value={zoneId} onChange={event => setZoneId(event.target.value)} className="mt-2 w-full border bg-white px-3 py-2"><option value="">Seleccionar barrio</option>{zones.map(zone => <option key={zone.id} value={zone.id} disabled={zone.price === null}>{zone.name} · {zone.price === null ? 'Sin tarifa' : cop(zone.price)}</option>)}</select></label>{zoneError && <p role="alert" className="mt-1 text-xs text-red-700">{zoneError}</p>}<label className="mt-4 block text-xs font-semibold uppercase">Dirección<input value={address} onChange={event => setAddress(event.target.value)} className="mt-2 w-full border bg-white px-3 py-2" /></label><label className="mt-4 block text-xs font-semibold uppercase">Referencia (opcional)<input value={reference} onChange={event => setReference(event.target.value)} className="mt-2 w-full border bg-white px-3 py-2" /></label></>}
        {!orderOnly && <fieldset className="mt-5 space-y-2 text-sm"><legend className="mb-2 text-xs font-semibold uppercase">{cashier ? 'Cobro' : '¿Cuándo se cobra?'}</legend>
          <label className="flex items-start gap-2"><input type="radio" name="collectWhen" checked={collectNow === true} onChange={() => setCollectNow(true)} /> <span>Cobrar ahora <small className="block text-[#526d80]">Registra el cobro completo junto con el pedido.</small></span></label>
          <label className="flex items-start gap-2"><input type="radio" name="collectWhen" checked={collectNow === false} onChange={() => setCollectNow(false)} /> <span>Después, en caja <small className="block text-[#526d80]">Queda en Pedidos como pendiente de pago.</small></span></label>
        </fieldset>}
        {!orderOnly && collectNow !== null && <label className="mt-4 block text-xs font-semibold uppercase">{collectNow ? "Método de pago" : "Método previsto"}<select value={payment} onChange={event => setPayment(event.target.value as typeof payment)} className="mt-2 w-full border bg-white px-3 py-2"><option>Efectivo</option><option value="Transferencia">{paymentMethodLabel("Transferencia")}</option></select></label>}
        {!orderOnly && collectNow === false && <p className="mt-1 text-xs text-[#526d80]">Puedes registrar un método diferente cuando cobres en caja.</p>}
        </>}
        {cashier ? <section className="cash-sale-selected">
          <h4>Productos seleccionados</h4>
          {!selected.length && <p>Agrega productos desde el catálogo.</p>}
          {selected.map(item => {
            const line = quote.data?.items.find(row => row.id === item.id);
            const price = line ? getBasePrice(line.product, null, null) : item.price;
            return <div className="cash-sale-line" key={item.id}>
              {item.image_url ? <img src={item.image_url} alt="" /> : <ShoppingCart size={20} />}
              <div><strong>{item.name}</strong><small>{cop(price)} c/u</small></div>
              <div className="cash-sale-stepper">
                <button type="button" aria-label={`Restar una unidad de ${item.name}`} onClick={() => changeQty(item.id, -1)}>−</button>
                <span>{item.qty}</span>
                <button type="button" aria-label={`Sumar una unidad de ${item.name}`} disabled={item.qty >= item.quantity} onClick={() => changeQty(item.id, 1)}>+</button>
              </div>
              <b>{cop(price * item.qty)}</b>
              <button type="button" aria-label={`Quitar ${item.name} de la venta`} onClick={() => changeQty(item.id, -item.qty)}><Trash2 size={15} /></button>
            </div>;
          })}
        </section> : null}
        {selected.length > 0 && !quote.data && <p role="status" className="mt-4 text-xs text-[#526d80]">{quote.error || 'Actualizando precios…'}</p>}
        {quote.data && quote.data.descuentoTotal > 0 && <p className="mt-4 flex justify-between text-sm"><span>Descuento</span><span>−{cop(quote.data.descuentoTotal)}</span></p>}
        {service === 'domicilio' && quote.data && <p className="mt-3 flex justify-between text-sm"><span>Domicilio</span><span>{cop(quote.data.delivery)}</span></p>}
        <div className="my-5 flex justify-between border-y py-4 text-lg font-medium"><span>{selected.length && !quote.data ? 'Subtotal provisional' : 'Total'}</span><span>{cop(total)}</span></div>
        <button onClick={save} disabled={!total || !quote.data || busy || (!additionOrderId && !orderOnly && collectNow === null)} className="flex w-full items-center justify-center gap-2 bg-[#086bb1] px-4 py-3 font-medium text-white disabled:opacity-40"><Check size={17} /> {busy ? "Registrando…" : additionOrderId ? "Agregar a la cuenta" : orderOnly ? "Guardar pedido" : collectNow === true ? "Registrar venta" : collectNow === false ? "Guardar pedido pendiente" : "Selecciona cuándo cobrar"}</button>
        <p role="status" className="mt-3 text-sm text-[#087fc7]">{message}</p>
        {ticket && <button type="button" onClick={() => window.print()} className="mt-3 block rounded border px-3 py-2 text-sm">Reimprimir ticket {ticket.number}</button>}
        {!staff && createdOrderId && <Link to={`/admin/pedido/${createdOrderId}`} className="mt-3 inline-block text-sm font-semibold underline">Abrir pedido{collectNow ? "" : " y cobrar en caja"} →</Link>}
      </aside>
    </div>
  </div>;
}

