import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Armchair, CalendarDays, ChevronRight, ClipboardList, Edit, Eye, MoreHorizontal, Plus, RefreshCw, Search, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { bogotaToday, periodDates, type AdminPeriod } from '../../lib/adminPeriods';
import { cop } from '../../lib/format';
import type { OrderStatus, PedidoFirestore } from '../../types/order';
import WhatsAppQuickSend from './WhatsAppQuickSend';
import { buildOrderQuickMessages } from '../../lib/whatsappTemplates';
import { fulfillmentLabels, fulfillmentStatus, paymentSummary } from '../../lib/orderStatus';
import './CashierOrdersBoard.css';

type Order = PedidoFirestore & { id: string };
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
const time = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
const tabs = ['Todos', 'Pendientes', 'Pagados', 'Entregados'] as const;
type Filter = typeof tabs[number];
function matches(order: Order, filter: Filter) {
  if (filter === 'Todos') return true;
  if (order.estado === 'cancelado') return false;
  if (filter === 'Entregados') return order.estado === 'entregado';
  return filter === 'Pagados' ? paymentSummary(order).balance === 0 : paymentSummary(order).balance > 0;
}
function serviceLabel(order: Order) {
  if (order.servicio === 'local') return order.cliente.mesa ? `Mesa ${order.cliente.mesa}` : 'En el local';
  return order.servicio === 'domicilio' ? 'Domicilio' : 'Para llevar';
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

type BoardProps = { orders: Order[]; refresh: () => void; takingOrders?: boolean; admin?: {
  edit: (order: Order) => void;
  remove: (id: string) => void;
  updateStatus: (id: string, status: OrderStatus) => void;
  exportOrders: (orders: Order[]) => void;
} };

export default function CashierOrdersBoard({ orders, refresh, takingOrders = false, admin }: BoardProps) {
  const navigate = useNavigate();
  const newOrderPath = (number: number) =>
    '/admin?seccion=' + (takingOrders ? 'tomar-pedido' : 'registrar-venta') + '&mesa=' + number;
  const [date, setDate] = useState(bogotaToday);
  const [period, setPeriod] = useState<AdminPeriod | 'todos'>(admin ? 'todos' : 'dia');
  const [status, setStatus] = useState<keyof typeof fulfillmentLabels | 'todos'>('todos');
  const [filter, setFilter] = useState<Filter>('Todos');
  const [search, setSearch] = useState('');
  const [table, setTable] = useState<number | null>(null);
  const [expanded, setExpanded] = useState('');
  const tableOrders = orders.filter(order =>
    order.servicio === 'local' && [1, 2, 3, 4, 5].includes(Number(order.cliente.mesa))
  );
  const openTables = tableOrders.filter(order => matches(order, 'Pendientes'));
  const range = date && period !== 'todos' ? periodDates(date, period) : null;
  const recent = (takingOrders ? tableOrders : orders).filter(order => {
    const orderDay = day.format(order.createdAt.toDate());
    return (!range || (orderDay >= range.from && orderDay < range.until)) &&
      (status === 'todos' || fulfillmentStatus(order.estado) === status) &&
      normalize([order.numeroOrden, order.cliente.nombres, order.cliente.celular, serviceLabel(order)].join(' ')).includes(normalize(search));
  });
  const visible = recent.filter(order => matches(order, filter));
  return <div className="co-board">
    <section className="co-tables">
      <header><h2><Armchair/> Mesas (5)</h2><div className="co-key"><span>Ocupada</span><span>Libre</span><span>Con pedido</span></div></header>
      <div className="co-table-grid">{[1,2,3,4,5].map(number => {
        const active = openTables.filter(order => Number(order.cliente.mesa) === number);
        const state = !active.length ? 'Libre' : active.every(order => fulfillmentStatus(order.estado) === 'registrado' && !(order.paidTotal ?? 0)) ? 'Con pedido' : 'Ocupada';
        return <button key={number} type="button" aria-expanded={active.length ? table === number : undefined} data-state={state} onClick={() => {
          if (active.length) setTable(table === number ? null : number);
          else navigate(newOrderPath(number));
        }}>
          <strong><Armchair size={23}/> Mesa {number}</strong><span className="co-table-status">{state}</span><ChevronRight className="co-arrow" size={20}/>
          <small>{active.length ? `${active.length} ${active.length === 1 ? 'pedido' : 'pedidos'} · ${cop(active.reduce((sum, order) => sum + paymentSummary(order).balance, 0))}` : 'Sin pedidos'}</small>
        </button>;
      })}</div>
      {table !== null && <div className="co-table-detail">
        <div className="co-detail-header">
          <div><h3>Mesa {table}</h3><p>Pedidos pendientes de esta mesa</p></div>
          <Link className="co-detail-button secondary" to={newOrderPath(table)}><Plus size={18}/>{takingOrders ? 'Nuevo pedido' : 'Nueva venta'}</Link>
        </div>
        <div className="co-detail-orders">
          {openTables.filter(order => Number(order.cliente.mesa) === table).map(order =>
            <article className="co-detail-order" key={order.id}>
              <div className="co-detail-info">
                <div className="co-detail-order-head"><strong>{order.numeroOrden}</strong><span className="co-tag">{fulfillmentLabels[fulfillmentStatus(order.estado)]}</span></div>
                <p>{order.items.map(item => item.qty + ' × ' + item.product.name).join(' · ')}</p>
                <div className="co-detail-amounts"><span>Total <b>{cop(order.total)}</b></span><span>Pagado <b>{cop(order.paidTotal ?? 0)}</b></span><span>Pendiente <b>{cop(paymentSummary(order).balance)}</b></span></div>
              </div>
              <div className="co-detail-actions">
                <Link className="co-detail-button primary" to={newOrderPath(table) + '&agregar=' + encodeURIComponent(order.id)}><Plus size={18}/>Agregar productos</Link>
                {!takingOrders && <Link className="co-detail-button secondary" to={'/admin/pedido/' + order.id}>Ver y cobrar <ChevronRight size={18}/></Link>}
              </div>
            </article>
          )}
        </div>
      </div>}
    </section>
    <section>
      <header className="co-tools"><h2><ClipboardList/> Pedidos recientes</h2>
        <label><Search/><input aria-label="Buscar pedido, cliente o mesa" placeholder="Buscar pedido, cliente o mesa…" value={search} onChange={e => setSearch(e.target.value)}/></label>
        {admin && <label><select aria-label="Período de pedidos" value={period} onChange={e => setPeriod(e.target.value as AdminPeriod | 'todos')}><option value="todos">Todas las fechas</option><option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option></select></label>}
        {period !== 'todos' && <label><CalendarDays/><input aria-label="Fecha de los pedidos" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
        {admin && <label><select aria-label="Filtrar por estado" value={status} onChange={e => setStatus(e.target.value as keyof typeof fulfillmentLabels | 'todos')}><option value="todos">Todos los estados</option>{Object.entries(fulfillmentLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>}
        {admin && <button type="button" onClick={() => admin.exportOrders(visible)}>Exportar</button>}
        <button type="button" aria-label="Actualizar pedidos y mesas" onClick={refresh}><RefreshCw/></button>
      </header>
      <div className="co-tabs">{tabs.map(tab => <button type="button" key={tab} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>{tab} ({recent.filter(order => matches(order, tab)).length})</button>)}</div>
      <div className="admin-data-table" role="region" tabIndex={0} aria-label="Pedidos recientes"><table><thead><tr>{['Pedido','Cliente','Mesa / Tipo','Total','Pago','Estado','Acciones'].map(title => <th key={title}>{title}</th>)}</tr></thead>
        <tbody>{visible.map(order => {
          const ServiceIcon = order.servicio === 'local' ? Armchair : order.servicio === 'domicilio' ? Truck : ShoppingBag;
          const payment = paymentSummary(order);
          return <Fragment key={order.id}><tr className={admin ? 'co-open-order' : undefined} onClick={admin ? event => {
            const target = event.target;
            if (!(target instanceof Element) || !event.currentTarget.contains(target) || target.closest('a, button, select, input, label, summary, [role="dialog"]')) return;
            navigate('/admin/pedido/' + order.id);
          } : undefined}>
            <td>{takingOrders ? <strong className="co-number">{order.numeroOrden}</strong> : <Link className="co-number" to={'/admin/pedido/' + order.id}>{order.numeroOrden}</Link>}<small>{time.format(order.createdAt.toDate())}</small></td>
            <td>{order.cliente.nombres || 'Consumidor final'}{admin && order.cliente.celular && <small>{order.cliente.celular} <WhatsAppQuickSend phone={order.cliente.celular} templates={buildOrderQuickMessages(order)} /></small>}</td><td><span className="co-tag"><ServiceIcon size={15}/>{serviceLabel(order)}</span>{admin && order.cliente.direccion && <small>{order.cliente.direccion}</small>}{admin && (order.cliente.coordenadas || order.cliente.mapsLink) && <small><a target="_blank" rel="noreferrer" href={order.cliente.coordenadas ? `https://maps.google.com/?q=${order.cliente.coordenadas.lat},${order.cliente.coordenadas.lng}` : order.cliente.mapsLink}>Ver ubicación</a></small>}</td>
            <td>{cop(order.total)}{admin && <><small>Cobrado: {cop(payment.collected)}</small><small>Saldo: {cop(payment.balance)}</small></>}</td><td><span className={'co-tag ' + (payment.balance === 0 ? 'paid' : 'due')}>{payment.label}</span></td>
            <td>{admin ? <select aria-label={'Estado de ' + order.numeroOrden} value={fulfillmentStatus(order.estado)} onChange={e => {
              const next = e.target.value as keyof typeof fulfillmentLabels;
              admin.updateStatus(order.id, next === 'registrado' ? (payment.balance === 0 ? 'pagado' : 'no_pagado') : next);
            }}>{Object.entries(fulfillmentLabels).filter(([value]) => value !== 'en_camino' || order.servicio === 'domicilio' || order.estado === 'en_camino').map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className={'co-tag ' + order.estado}>{fulfillmentLabels[fulfillmentStatus(order.estado)]}</span>}</td>
            <td><div className="co-actions">{!takingOrders && <Link aria-label={'Ver pedido ' + order.numeroOrden} to={'/admin/pedido/' + order.id}><Eye size={19}/></Link>}{admin && <><button type="button" aria-label={'Editar pedido ' + order.numeroOrden} onClick={() => admin.edit(order)}><Edit size={18}/></button><button type="button" aria-label={'Eliminar pedido ' + order.numeroOrden} onClick={() => admin.remove(order.id)}><Trash2 size={18}/></button></>}<button aria-label={'Productos de ' + order.numeroOrden} aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? '' : order.id)}>{takingOrders ? <Eye size={19}/> : <MoreHorizontal size={19}/>}</button></div></td>
          </tr>{expanded === order.id && <tr><td colSpan={7}><strong>Productos</strong><ul>{order.items.map((item, index) => <li key={index}>{item.qty} × {item.product.name}{item.version ? ' (' + item.version + ')' : ''}</li>)}</ul><small>Método de pago: {order.formaPago} · Descuento: {cop(order.descuentoTotal ?? 0)}</small>{order.cliente.referencia && <small>Referencia: {order.cliente.referencia}</small>}</td></tr>}</Fragment>;
        })}</tbody></table></div>
      {!visible.length && <p className="co-empty">No hay pedidos que coincidan con los filtros.</p>}
    </section>
  </div>;
}
