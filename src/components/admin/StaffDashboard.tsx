import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Utensils, Boxes } from 'lucide-react';
import { OrderService } from '../../services/orderService';
import { fulfillmentLabels, fulfillmentStatus, paymentSummary } from '../../lib/orderStatus';
import { cop } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import type { PedidoFirestore } from '../../types/order';
import AdminLayout, { type AdminSection } from './AdminLayout';
import InventoryAdmin from './InventoryAdmin';
import CashierHome from './CashierHome';
import WelcomeBanner from './WelcomeBanner';
import RegisterSale from './RegisterSale';
import CashierOrdersBoard from './CashierOrdersBoard';
import OrderPayments from './OrderPayments';
import OrderActivity from './OrderActivity';
import '../../pages/admin/OrderDetailPage.css';

type Order = PedidoFirestore & { id: string };

function StaffOrders({ selectedId, takingOrders = false }: { selectedId?: string; takingOrders?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => OrderService.subscribeToOrders(data => {
    setOrders(data); setError(''); setLoaded(true);
  }, {}, err => setError(err.message)), [revision]);
  if (error) return <div role="alert">{error} <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Reintentar</button></div>;
  if (!loaded) return <p>Cargando pedidos…</p>;
  if (selectedId) {
    const order = orders.find(item => item.id === selectedId);
    return <div className="cashier-detail mx-auto max-w-6xl text-[#102951]">
      <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#087fc7]" to="/admin?seccion=pedidos">Volver a pedidos</Link>
      {order ? <>
        <div className="cashier-detail-heading flex flex-wrap items-center justify-between gap-3 py-4">
          <div><p className="text-sm text-[#526d80]">Pedido</p><h2 className="break-all text-xl font-semibold">{order.numeroOrden}</h2></div>
          <span className="rounded-full bg-[#e9f6ff] px-4 py-2 text-sm font-semibold">Pago: {paymentSummary(order).label}</span>
        </div>
        <a className="order-payment-link" href="#cobros-pedido">Ir a cobros ↓</a>
        <div className="order-columns">
          <section className="cashier-detail-section order-summary">
            <h3 className="text-lg font-semibold">Resumen del pedido</h3>
            <p className="mt-3 text-sm text-[#526d80]">Cliente</p><p className="font-medium">{order.cliente.nombres}</p>
            <p className="mt-3 text-sm text-[#526d80]">Servicio</p><p>{order.servicio === 'local' ? `En el local${order.cliente.mesa ? ` · Mesa ${order.cliente.mesa}` : ''}` : order.servicio === 'domicilio' ? 'Domicilio' : 'Para llevar'}</p>
            {order.servicio === 'domicilio' && <div className="mt-3">
              <p className="text-sm text-[#526d80]">Dirección de entrega</p>
              <p>{[order.cliente.direccion, order.cliente.barrio].filter(Boolean).join(' · ')}</p>
              {order.cliente.referencia && <p>{order.cliente.referencia}</p>}
              {order.cliente.coordenadas && <a className="text-sm text-[#087fc7] underline" target="_blank" rel="noreferrer"
                href={`https://maps.google.com/?q=${order.cliente.coordenadas.lat},${order.cliente.coordenadas.lng}`}>Ver ubicación en Google Maps</a>}
            </div>}
            <p className="mt-3 text-sm text-[#526d80]">Estado del pedido</p><p>{fulfillmentLabels[fulfillmentStatus(order.estado)]}</p>
            <h4 className="mt-5 font-semibold">Productos</h4><ul className="mt-2 divide-y divide-sky-100">{order.items.map(item => <li className="py-2" key={item.id}>{item.qty} × {item.product.name}</li>)}</ul>
            <div className="mt-3 flex justify-between border-t border-sky-200 pt-3 text-lg font-semibold"><span>Total</span><span>{cop(order.total)}</span></div>
          </section>
          <div className="order-flow"><OrderPayments key={order.id} order={order} canRefund={false} onChanged={() => setRevision(n => n + 1)} />
          <div className="cashier-detail-activity"><OrderActivity orderId={order.id} revision={order.updatedAt.toMillis() + revision} /></div>
          </div>
        </div>
      </> : <p>Pedido no encontrado.</p>}
    </div>;
  }
  return <CashierOrdersBoard takingOrders={takingOrders} orders={orders} refresh={() => setRevision(value => value + 1)} />;
}

export default function StaffDashboard({ cashier }: { cashier: boolean }) {
  const [identity, setIdentity] = useState<{ role: string; number: number } | null>(null);
  useEffect(() => { void supabase?.rpc('staff_greeting').then(({ data }) => setIdentity(data?.[0] ?? null)); }, []);
  const [params] = useSearchParams();
  const { id } = useParams();
  const available: AdminSection[] = cashier ? ['inicio','registrar-venta','pedidos','breb','inventario'] : ['inicio','tomar-pedido','mesas','inventario'];
  const requested = (id ? 'pedidos' : params.get('seccion')) as AdminSection;
  const section = available.includes(requested) ? requested : 'inicio';
  return <AdminLayout cashierHome={cashier && (section === "inicio" || section === "pedidos")} accountLabel={cashier ? "Usuario en caja" : "Sistema de pedidos"} pageTitle={cashier && id ? "Detalle del pedido" : cashier && section === "pedidos" ? "Pedidos y Mesas" : undefined} pageDescription={cashier && section === "inicio" ? "Panel de caja" : cashier && id ? "Consulta el pedido y registra su cobro." : cashier && section === "pedidos" ? "Gestiona los pedidos, las mesas y el estado de cada venta." : undefined} allowedSections={available.filter(item => item !== 'tomar-pedido')} activeSection={section}>
    {section === 'inicio' && cashier && <CashierHome />}
    {section === 'inicio' && !cashier && <div className="cash-home shift-home"><WelcomeBanner description={identity ? `Usuario del sistema de pedidos ${identity.number} · turno ${identity.role === 'manana' ? 'mañana' : 'tarde'}. Selecciona una opción para comenzar.` : 'Selecciona una opción para comenzar tu jornada.'} /><div className="shift-actions grid gap-4 sm:grid-cols-2">
      <Link to="/admin?seccion=mesas" className="flex min-h-36 flex-col justify-center rounded-xl border border-sky-200 bg-white p-6 shadow-sm"><Utensils size={32} aria-hidden="true" className="mb-3 text-[#087fc7]" /><strong className="text-xl text-[#061d70]">Pedidos por mesas</strong><span className="mt-2 text-sm text-[#526d80]">Elige una mesa para tomar el pedido.</span></Link>
      <Link to="/admin?seccion=inventario" className="flex min-h-36 flex-col justify-center rounded-xl border border-sky-200 bg-white p-6 shadow-sm"><Boxes size={32} aria-hidden="true" className="mb-3 text-[#087fc7]" /><strong className="text-xl text-[#061d70]">Inventario</strong><span className="mt-2 text-sm text-[#526d80]">Consulta existencias y registra entradas.</span></Link>
    </div></div>}
    {section === 'pedidos' && <StaffOrders selectedId={id}/>}
    {section === 'mesas' && <StaffOrders takingOrders/>}
    {section === 'inventario' && <InventoryAdmin staff/>}
    {(section === 'registrar-venta' || section === 'tomar-pedido') && <RegisterSale key={params.get('mesa') ?? 'general'} cashier={cashier} staff={!cashier} orderOnly={!cashier} />}
  </AdminLayout>;
}
