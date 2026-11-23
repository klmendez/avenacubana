import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Phone, Clock, Package, User, CreditCard, Send
} from 'lucide-react';
import type { PedidoFirestore } from '../../types/order';
import { cop } from '../../lib/format';
import { TOPPINGS } from '../../data/toppings';
import { EXTRAS } from '../../data/extras';
import { getToppingNamesList, getExtrasDetail } from '../../lib/whatsapp';
import { isFixedPrice } from '../../data/products';
import { OrderService } from '../../services/orderService';
import AdminAuth from '../../components/AdminAuth';
import AdminLayout from '../../components/admin/AdminLayout';
import { fulfillmentLabels, fulfillmentStatus, paymentSummary } from '../../lib/orderStatus';
import './OrderDetailPage.css';
import OrderActivity from '../../components/admin/OrderActivity';
import OrderPayments from '../../components/admin/OrderPayments';

/* ─────────── Calculadora de cambio ─────────── */
function CalculadoraCambio({
  orderId,
  total,
  delivery,
  savedDomi,
  savedNegocio
}: {
  orderId: string;
  total: number;
  delivery: number;
  savedDomi?: number;
  savedNegocio?: number;
}) {
  const [clienteDa, setClienteDa] = useState('');
  const [domiRecibe, setDomiRecibe] = useState(
    savedDomi ? String(savedDomi) : delivery > 0 ? String(delivery) : ''
  );
  const [guardadoMsg, setGuardadoMsg] = useState<string | null>(null);

  const montoCliente = Number(clienteDa.replace(/\D/g, '')) || 0;
  const domiMonto = Number(domiRecibe.replace(/\D/g, '')) || 0;

  const cambio = montoCliente > total ? montoCliente - total : 0;
  const falta = montoCliente < total && montoCliente > 0 ? total - montoCliente : 0;
  const paraNegocio = total - domiMonto;

  const fmt = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n ? Number(n).toLocaleString('es-CO') : '';
  };

  const guardar = async () => {
    if (!domiMonto) return;
    try {
      await OrderService.updateOrder(orderId, {
        montoDomiciliario: domiMonto,
        montoNegocio: paraNegocio
      });
      setGuardadoMsg('Distribucion guardada');
      setTimeout(() => setGuardadoMsg(null), 3000);
    } catch {
      setGuardadoMsg('Error al guardar');
      setTimeout(() => setGuardadoMsg(null), 3000);
    }
  };

  return (
    <div className="border-t border-gray-200 pt-4">
      <h3 className="mb-3 text-lg font-semibold text-black flex items-center gap-2">
        Calculadora de Cambio
        {(savedDomi || savedNegocio) && (
          <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Guardado</span>
        )}
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total del pedido:</span>
          <span className="font-semibold text-black">{cop(total)}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 shrink-0 w-24">Cliente da:</label>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="text" inputMode="numeric"
              value={clienteDa ? fmt(clienteDa) : ''}
              onChange={(e) => setClienteDa(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 shrink-0 w-24">Para domi:</label>
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="text" inputMode="numeric"
              value={domiRecibe ? fmt(domiRecibe) : ''}
              onChange={(e) => setDomiRecibe(e.target.value.replace(/\D/g, ''))}
              placeholder={delivery > 0 ? `Sugerido: ${cop(delivery)}` : '0'}
              className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
        {montoCliente > 0 && (
          <div className="rounded-lg space-y-2">
            {cambio > 0 && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <span className="text-sm text-green-700">Cambio para cliente:</span>
                <span className="font-semibold text-green-700">{cop(cambio)}</span>
              </div>
            )}
            {falta > 0 && (
              <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="text-sm text-red-700">Falta por pagar:</span>
                <span className="font-semibold text-red-700">{cop(falta)}</span>
              </div>
            )}
            {montoCliente === total && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-700">Pago exacto!</span>
                <span className="font-semibold text-blue-700">Sin cambio</span>
              </div>
            )}
          </div>
        )}
        {domiMonto > 0 && (
          <div className="rounded-lg border-t border-gray-200 pt-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Distribucion</div>
            <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <span className="text-sm text-orange-700">Para domiciliario:</span>
              <span className="font-semibold text-orange-700">{cop(domiMonto)}</span>
            </div>
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <span className="text-sm text-red-700">Para Avena Cubana Pop:</span>
              <span className="font-semibold text-red-700">{cop(paraNegocio)}</span>
            </div>
            <button
              onClick={guardar}
              className="w-full mt-2 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-black transition-colors"
            >
              Guardar distribucion
            </button>
            {guardadoMsg && (
              <div className="text-center text-xs text-green-600 font-medium">{guardadoMsg}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Constantes ─────────── */
/* ─────────── Page ─────────── */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<PedidoFirestore & { id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMsg, setEditMsg] = useState('');

  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!id) return;
    return OrderService.subscribeToOrder(id, next => {
      setOrder(next);
      setLoadError('');
      setLoading(false);
    }, error => {
      setLoadError(error.message);
      setLoading(false);
    });
  }, [id, revision]);

  const fmtDate = (ts: Date | string | number | { toDate(): Date } | null | undefined) => {
    if (!ts) return 'N/A';
    const d = typeof ts === 'object' && !(ts instanceof Date) && 'toDate' in ts ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  if (loading) {
    return (
      <AdminAuth>
        <AdminLayout>
          <div className="p-8 text-center text-gray-500">Cargando pedido...</div>
        </AdminLayout>
      </AdminAuth>
    );
  }

  if (!order || order.id !== id || loadError) {
    return (
      <AdminAuth>
        <AdminLayout>
          <div className="p-8">
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-gray-500 hover:text-black mb-4">
              <ArrowLeft size={18} /> Volver
            </button>
            <p className="text-red-500">{loadError || 'Pedido no encontrado'}</p>
            {loadError && <button type="button" onClick={() => setRevision(n => n + 1)}>Reintentar</button>}
          </div>
        </AdminLayout>
      </AdminAuth>
    );
  }

  const payment = paymentSummary(order);
  const wa = (cel: string, msg: string) => {
    const n = String(cel || '').replace(/\D/g, '');
    const f = n.startsWith('57') ? n : `57${n}`;
    return `https://api.whatsapp.com/send?phone=${f}&text=${encodeURIComponent(msg)}`;
  };

  const openWA = () => {
    const p = order.cliente.celular.replace(/\D/g, '');
    const m = `Hola ${order.cliente.nombres}! Te contactamos desde Avena Cubana Pop sobre tu pedido ${order.numeroOrden}.`;
    window.open(`https://api.whatsapp.com/send?phone=57${p}&text=${encodeURIComponent(m)}`, '_blank');
  };

  const openMaps = () => {
    if (order.cliente.coordenadas) {
      const { lat, lng } = order.cliente.coordenadas;
      window.open(`https://maps.google.com/?q=${lat},${lng}`, '_blank');
    } else if (order.cliente.mapsLink) {
      window.open(order.cliente.mapsLink, '_blank');
    }
  };

  return (
    <AdminAuth>
      <AdminLayout pageTitle="Detalle del pedido" pageDescription={order.cliente.nombres}>
        <article className="order-workspace">
          <header className="order-heading">
            <button type="button" onClick={() => navigate('/admin?seccion=pedidos')} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><ArrowLeft size={16} /> Volver a pedidos</button>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-all text-lg font-semibold">{order.numeroOrden}</h2>
                <p className="text-sm text-slate-600">{fmtDate(order.createdAt)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${payment.balance === 0 ? 'bg-green-100 text-green-700 border-green-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>Pago: {payment.label}</span>
            </div>
            <a className="order-payment-link" href="#cobros-pedido">Ir a cobros y devoluciones ↓</a>
          </header>
          <div className="order-columns">
            <div className="order-pane order-summary">
{/* Productos */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="mb-3 text-lg font-semibold text-black">Productos ({order.items.length})</h3>
              <div className="space-y-4">
                {order.items.map((item, index) => {
                  let unitPrice = 0;
                  if (item.product.category === 'gomitas') {
                    if (item.version && item.size) {
                      unitPrice = (item.product.prices as Record<string, Record<string, number>>)[item.version]?.[item.size] ?? 0;
                    }
                  } else if (item.product.category === 'frutafresh') {
                    if (isFixedPrice(item.product.prices)) {
                      unitPrice = item.product.prices.fijo ?? 0;
                    } else if (item.size && item.product.prices.porSize) {
                      unitPrice = item.product.prices.porSize[item.size] ?? 0;
                    }
                  }

                  const baseLine = unitPrice * item.qty;
                  const maxToppings = item.product.toppingsIncludedMax ?? 0;
                  const toppingNames = maxToppings > 0 ? getToppingNamesList(item.toppingIds, TOPPINGS) : [];
                  const extrasDetail = getExtrasDetail(item.extrasQty, item.qty, EXTRAS, item.extraSelections ?? {}, TOPPINGS);
                  const extrasTotalMonto = extrasDetail.reduce((s, e) => s + e.total, 0);
                  const itemDiscounts = item.discounts ?? [];
                  const itemDiscountTotal = itemDiscounts.reduce((s, d) => s + d.descuento, 0);
                  const netTotal = baseLine + extrasTotalMonto - itemDiscountTotal;

                  return (
                    <div key={item.id || index} className="border-b border-gray-200 pb-3 last:border-0">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-semibold text-black">
                          x{item.qty} {item.product.name}
                        </h4>
                        <div className="text-right shrink-0 font-semibold text-black">{cop(netTotal)}</div>
                      </div>

                      {(item.version || item.size) && (
                        <div className="mt-1 text-sm text-gray-500">
                          {item.version === 'ahogada' ? 'Ahogada' : item.version === 'picosa' ? 'Picosa' : ''}
                          {item.version && item.size ? ' · ' : ''}
                          {item.size === 'pequeno' ? 'Pequeno' : item.size === 'mediano' ? 'Mediano' : item.size === 'grande' ? 'Grande' : ''}
                        </div>
                      )}

                      <div className="mt-1 text-sm text-gray-600">Precio del producto: {cop(baseLine)}</div>
                      {order.servicio === 'local' && <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#087fc7]"><input type="checkbox" checked={Boolean(item.servido)} onChange={async event => { const served = event.target.checked; try { await OrderService.setItemServed(order.id, item.id, served); setOrder(current => current ? { ...current, items: current.items.map(i => i.id === item.id ? { ...i, servido: served } : i) } : current); } catch { alert('No se pudo actualizar el producto. Inténtalo nuevamente.'); } }} /> Llevado a la mesa {item.qty > 1 ? `(las ${item.qty} unidades)` : ''}</label>}
                      {item.note?.trim() ? <div className="mt-2 border-l-2 border-rojo pl-3 text-sm text-gray-700"><span className="font-semibold">Indicación:</span> {item.note}</div> : null}

                      {toppingNames.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Incluye</div>
                          <ul className="mt-1 space-y-0.5">
                            {toppingNames.map((n, i) => (
                              <li key={i} className="text-sm text-gray-600">• {n}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {extrasDetail.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Adiciones</div>
                          <ul className="mt-1 space-y-0.5">
                            {extrasDetail.map((e, i) => (
                              <li key={i} className="flex justify-between text-sm text-gray-600">
                                <span>• {e.name}{e.qty > 1 ? ` x${e.qty}` : ''}{e.selectionNames?.length ? ` (${e.selectionNames.join(', ')})` : ''}</span>
                                <span>{cop(e.total)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {itemDiscounts.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {itemDiscounts.map((d, i) => (
                            <div key={i} className="flex justify-between text-sm text-rojo">
                              <span>{d.nombre}</span>
                              <span>-{cop(d.descuento)}</span>
                            </div>
                          ))}
                        </div>
                      )}


                    </div>
                  );
                })}
              </div>
            </div>
{/* Pago */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-black">
                <CreditCard size={20} /> Resumen del pedido
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Subtotal:</span>
                  <span className="text-black">{cop(order.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Envío</span>
                  <span className="text-black">{cop(order.delivery)}</span>
                </div>

                {(order.descuentoTotal ?? 0) > 0 && (
                  <>
                    {(order.promociones || []).map((promo, idx) => (
                      <div key={idx} className="flex items-center justify-between text-rojo">
                        <span>{promo.nombre}:</span>
                        <span className="font-semibold">-{cop(promo.descuento)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-rojo font-semibold">
                      <span>Descuento total:</span>
                      <span>-{cop(order.descuentoTotal!)}</span>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-lg font-semibold">
                  <span className="text-black">Total:</span>
                  <span className="text-black">{cop(order.total)}</span>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <span className="text-gray-500 block mb-2">Método de pago</span>
                  {order.detallesPago && order.detallesPago.length > 0 ? (
                    <div className="space-y-2">
                      {order.detallesPago.map((pago, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                          <span className="text-black">{pago.metodo}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-black">{cop(pago.monto)}</span>
                            {order.servicio === 'domicilio' && pago.entregadoDomiciliario && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Al domiciliario</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-black">{order.formaPago}</span>
                  )}
                </div>
              </div>
            </div>
{/* Nota admin */}
            {order.notaAdmin && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="mb-3 text-lg font-semibold text-black">Nota del Administrador</h3>
                <p className="text-gray-700">{order.notaAdmin}</p>
              </div>
            )}
</div>
<div className="order-flow">
<OrderPayments key={order.id} order={order} onChanged={() => setRevision(n => n + 1)} />
<div className="order-pane">
{/* Cliente */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-black">
                <User size={20} /> Cliente y entrega
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Nombre:</span>
                  <span className="text-black">{order.cliente.nombres}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Teléfono</span>
                  <div className="flex items-center gap-2">
                    <span className="text-black">{order.cliente.celular}</span>
                    <button aria-label="Abrir WhatsApp del cliente" onClick={openWA} className="rounded p-1 text-green-400 hover:bg-green-400/20">
                      <Phone size={16} />
                    </button>
                  </div>
                </div>
                {order.cliente.cedula && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">🎂 Cedula (descuento cumpleanos):</span>
                    <span className="text-black font-semibold">{order.cliente.cedula}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Servicio:</span>
                  <span className="text-black">{order.servicio === 'domicilio' ? 'Domicilio' : order.servicio === 'local' ? `En Avena Cubana Pop${order.cliente.mesa ? ` · Mesa ${order.cliente.mesa}` : ''}` : 'Para llevar'}</span>
                </div>
                {order.servicio === 'domicilio' && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Dirección:</span>
                      <span className="text-black">{[order.cliente.direccion, order.cliente.barrio].filter(Boolean).join(" · ")}</span>
                    </div>
                    {order.cliente.coordenadas && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Ubicacion:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">
                            {order.cliente.coordenadas.lat.toFixed(6)}, {order.cliente.coordenadas.lng.toFixed(6)}
                          </span>
                          <button onClick={openMaps} className="rounded p-1 text-blue-400 hover:bg-blue-400/20">
                            <MapPin size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                    {order.cliente.ubicacionTiempoReal && order.cliente.ubicacionTiempoReal.length > 1 && (
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                        <div className="flex items-center gap-2 text-blue-300">
                          <Clock size={16} />
                          <span className="font-semibold">Ubicacion en Tiempo Real Activa</span>
                        </div>
                        <p className="mt-1 text-sm text-blue-200">
                          Última actualización {' '}
                          {new Date(order.cliente.ubicacionTiempoReal[order.cliente.ubicacionTiempoReal.length - 1].timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
{/* Estado */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-black">
                <Package size={20} /> Seguimiento del pedido
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Estado del pedido</span>
                  <span className="text-black">{fulfillmentLabels[fulfillmentStatus(order.estado)]}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Creado</span>
                  <span className="text-black">{fmtDate(order.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Última actualización</span>
                  <span className="text-black">{fmtDate(order.updatedAt)}</span>
                </div>
              </div>
              <OrderActivity orderId={order.id} revision={order.updatedAt.toMillis()} />
              {order.historialEstado && order.historialEstado.length > 1 && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <h4 className="mb-2 text-sm font-semibold text-black">Historial de Estados</h4>
                  <div className="space-y-2">
                    {order.historialEstado.map((h, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">{fulfillmentLabels[fulfillmentStatus(h.estado)]}</span>
                        <span className="text-gray-500">{fmtDate(h.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
<details><summary>Calculadora de cambio</summary>{/* Calculadora */}
            <CalculadoraCambio
              orderId={order.id}
              total={order.total}
              delivery={order.delivery}
              savedDomi={order.montoDomiciliario}
              savedNegocio={order.montoNegocio}
            /></details>
{/* WhatsApp */}
            <div className="border-t border-gray-200 pt-4">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-black">
                <Send size={20} /> Enviar mensaje al cliente
              </h3>
              {(() => {
                const productosResumen = order.items.map(it => {
                  const detalles: string[] = [];
                  if (it.version) detalles.push(it.version === 'ahogada' ? 'Ahogada' : 'Picosa');
                  if (it.size) detalles.push(it.size === 'pequeno' ? 'Peq' : it.size === 'mediano' ? 'Med' : 'Gde');
                  const detalleStr = detalles.length ? ` (${detalles.join(' · ')})` : '';
                  return `• x${it.qty} ${it.product.name}${detalleStr}`;
                }).join('\n');

                const direccionInfo = order.servicio === 'domicilio' && order.cliente.direccion
                  ? `\nDirección: ${order.cliente.direccion}${order.cliente.barrio ? ` (${order.cliente.barrio})` : ''}`
                  : '';

                const descuentoInfo = (order.descuentoTotal ?? 0) > 0
                  ? `\nDescuento: -${cop(order.descuentoTotal!)}`
                  : '';

                const pagoInfo = `${descuentoInfo}\nTotal: ${cop(order.total)} · ${order.formaPago}`;

                const presets = [
                  {
                    label: 'Confirmado',
                    text: `Hola ${order.cliente.nombres}!\n\nTu pedido *${order.numeroOrden}* ha sido *CONFIRMADO*.\n\nProductos:\n${productosResumen}${direccionInfo}${pagoInfo}\n\nGracias por elegir Avena Cubana Pop!`
                  },
                  {
                    label: 'En preparacion',
                    text: `Hola ${order.cliente.nombres}!\n\nTu pedido *${order.numeroOrden}* esta en *PREPARACION*.\n\nProductos:\n${productosResumen}${direccionInfo}${pagoInfo}\n\nPronto estara listo. Te avisamos!`
                  },
                  {
                    label: 'En camino',
                    text: `Hola ${order.cliente.nombres}!\n\nTu pedido *${order.numeroOrden}* ya esta *EN CAMINO*.\n\nProductos:\n${productosResumen}${direccionInfo}${pagoInfo}\n\nEsperalo pronto!`
                  },
                  {
                    label: 'Listo para recoger',
                    text: `Hola ${order.cliente.nombres}!\n\nTu pedido *${order.numeroOrden}* esta *LISTO PARA RECOGER*.\n\nProductos:\n${productosResumen}${pagoInfo}\n\nPasa cuando quieras!`
                  },
                  {
                    label: 'Pago pendiente',
                    text: `Hola ${order.cliente.nombres}!\n\nRecordatorio: tu pedido *${order.numeroOrden}* tiene *PAGO PENDIENTE*.\n\nProductos:\n${productosResumen}${pagoInfo}\n\nEnvianos el comprobante por aqui para confirmar. Gracias!`
                  },
                  {
                    label: 'Entregado',
                    text: `Hola ${order.cliente.nombres}!\n\nTu pedido *${order.numeroOrden}* ha sido *ENTREGADO*.\n\nProductos:\n${productosResumen}${pagoInfo}\n\nTodo estuvo bien? Nos encantaria saber tu opinion!`
                  },
                ];

                return (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {presets.map((preset, idx) => (
                        <button key={idx} onClick={() => setEditMsg(preset.text)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:border-red-400 bg-gray-50 hover:bg-white transition-colors text-left">
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={editMsg}
                      onChange={(e) => setEditMsg(e.target.value)}
                      rows={3}
                      placeholder="Escribe un mensaje personalizado para el cliente..."
                      className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors resize-none"
                    />
                    <a
                      href={editMsg.trim() ? wa(order.cliente.celular, editMsg.trim()) : '#'}
                      target="_blank" rel="noreferrer"
                      onClick={(e) => { if (!editMsg.trim()) e.preventDefault(); }}
                      className={`mt-3 w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl transition-colors ${
                        editMsg.trim()
                          ? 'bg-green-600 hover:bg-green-700 text-white cursor-pointer'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Send size={15} /> Enviar por WhatsApp al cliente
                    </a>
                  </>
                );
              })()}
            </div>
{/* Footer */}
            <div className="flex gap-3">
              <button
                onClick={openWA}
                className="flex-1 rounded-lg bg-green-600 py-2 font-semibold text-white hover:bg-green-700"
              >
                Contactar por WhatsApp
              </button>
              {order.cliente.coordenadas && (
                <button
                  onClick={openMaps}
                  className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Ver en Maps
                </button>
              )}
            </div>
</div>
</div>
</div>
</article>
      </AdminLayout>
    </AdminAuth>
  );
}
