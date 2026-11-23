import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Utensils } from "lucide-react";
import { OrderService } from "../../services/orderService";
import type { PedidoFirestore } from "../../types/order";
import { cop } from "../../lib/format";

type Order = PedidoFirestore & { id: string };
const states: Record<string, string> = { no_pagado: "Sin pagar", pagado: "Pagado", preparando: "Preparando", en_camino: "En camino", entregado: "Entregado" };
export default function TableOrders({ takingOrders = false }: { takingOrders?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const all = await OrderService.getOrders();
      setOrders(all.filter(order => order.servicio === "local" && order.estado !== "cancelado" && (order.paidTotal ?? 0) < order.total && Number(order.cliente?.mesa) >= 1 && Number(order.cliente?.mesa) <= 5));
      setError("");
    } catch { setError("No pudimos cargar las cuentas de las mesas."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => window.clearInterval(timer); }, [load]);
  const byTable = (table: number) => orders.filter(order => Number(order.cliente?.mesa) === table);
  const current = selected ? byTable(selected) : [];
  return <section className="mb-8 border-b border-[#b6d9ed] pb-6">
    <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-medium text-[#061d70]"><Utensils size={20} className="text-[#087fc7]" /> Mesas</h2><p className="mt-1 text-sm text-[#526d80]">Consulta los pedidos abiertos y el saldo pendiente de cada mesa.</p></div><button type="button" onClick={() => void load()} aria-label="Actualizar mesas" className="p-2 text-[#087fc7]"><RefreshCw size={18} /></button></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="mt-4 text-sm text-[#526d80]">Cargando mesas...</p> : <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">{[1,2,3,4,5].map(number => { const rows = byTable(number); const due = rows.reduce((sum, row) => sum + Math.max(0, row.total - (row.paidTotal ?? 0)), 0); return <button key={number} type="button" aria-pressed={selected === number} onClick={() => setSelected(selected === number ? null : number)} className={`min-h-44 rounded-xl border px-5 py-5 text-left transition ${selected === number ? "border-[#087fc7] bg-[#d5efff]" : "border-[#b6d9ed] bg-transparent hover:bg-[#e9f6ff]"}`}><span className="block text-sm font-medium">Mesa</span><span className="block text-5xl font-semibold leading-tight">{number}</span><span className="mt-1 block text-xs text-[#526d80]">{rows.length ? `${rows.length} ${rows.length === 1 ? "pedido abierto" : "pedidos abiertos"}` : "Sin pedidos abiertos"}</span><span className="mt-2 block text-sm text-[#087fc7]">Pendiente: {cop(due)}</span></button>; })}</div>}
    {selected !== null && <div className="mt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-medium">Mesa {selected}</h3>{takingOrders && <Link to={`/admin?seccion=tomar-pedido&mesa=${selected}`} className="rounded-lg bg-[#087fc7] px-5 py-3 font-semibold text-white">Tomar pedido en mesa {selected}</Link>}</div>{current.length ? <div className="mt-2 divide-y divide-[#b6d9ed] border-y border-[#b6d9ed]">{current.map(order => <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium">Pedido {order.numeroOrden} · {states[order.estado] || order.estado}</p><p className="mt-1 text-xs text-[#526d80]">{order.items.map(item => `${item.qty} × ${item.product.name}`).join(", ")}</p><p className="mt-1 text-xs text-[#526d80]">Total {cop(order.total)} · Pagado {cop(order.paidTotal ?? 0)} · Pendiente {cop(Math.max(0, order.total - (order.paidTotal ?? 0)))}</p></div>{!takingOrders && <Link to={`/admin/pedido/${order.id}`} className="text-sm font-medium text-[#087fc7] underline">Ver pedido y cobrar</Link>}</div>)}</div> : <p className="mt-2 text-sm text-[#526d80]">Esta mesa no tiene pedidos abiertos.</p>}<p className="mt-3 text-xs text-[#526d80]">Un pedido deja de aparecer aquí cuando está entregado y pagado, o si se cancela. Cada pedido se cobra por separado.</p></div>}
  </section>;
}
