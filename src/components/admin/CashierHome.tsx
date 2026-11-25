import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, ClipboardList, Boxes, ChevronRight, ReceiptText, Clock3, TriangleAlert, ChartNoAxesCombined, Info, CalendarDays } from 'lucide-react';
import { OrderService } from '../../services/orderService';
import { supabase } from '../../lib/supabase';
import WelcomeBanner from './WelcomeBanner';
import './CashierHome.css';

const actions = [
  { section: 'registrar-venta', title: 'Registrar venta', text: 'Realiza una nueva venta de productos.', icon: ShoppingCart },
  { section: 'pedidos', title: 'Pedidos', text: 'Consulta y gestiona los pedidos.', icon: ClipboardList },
  { section: 'inventario', title: 'Inventario', text: 'Consulta existencias de productos.', icon: Boxes },
];
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
const dateLabel = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' });

export default function CashierHome() {
  const [counts, setCounts] = useState<{ sales: number; pending: number; alerts: number }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let loading = false;
    async function refresh() {
      if (!supabase || loading) return;
      loading = true;
      try {
        const stockTask = async () => {
          let alerts = 0;
          for (let start = 0; ; start += 500) {
            const result = await supabase!.from('inventory_items').select('quantity,minimum_quantity').is('deleted_at', null).order('id').range(start, start + 499);
            if (result.error) throw result.error;
            alerts += result.data.filter(item => Number(item.quantity) <= Number(item.minimum_quantity)).length;
            if (result.data.length < 500) return alerts;
          }
        };
        const [orders, alerts] = await Promise.all([OrderService.getOrders(), stockTask()]);
        const today = dayKey.format(new Date());
        const open = orders.filter(order => order.estado !== 'cancelado');
        if (active) {
          setCounts({
            sales: open.filter(order => dayKey.format(order.createdAt.toDate()) === today && (order.paidTotal ?? 0) >= order.total).length,
            pending: open.filter(order => (order.paidTotal ?? 0) < order.total).length,
            alerts,
          });
          setError(false);
        }
      } catch { if (active) setError(true); }
      finally { loading = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const stats = [
    { label: 'Ventas registradas', value: counts?.sales, icon: ReceiptText },
    { label: 'Pedidos pendientes', value: counts?.pending, icon: Clock3 },
    { label: 'Alertas de inventario', value: counts?.alerts, icon: TriangleAlert },
  ];
  return <div className="cash-home">
    <WelcomeBanner />
    <nav className="cash-actions" aria-label="Accesos de caja">{actions.map(({ section, title, text, icon: Icon }) =>
      <Link key={section} to={'/admin?seccion=' + section}><Icon className="cash-action-icon" aria-hidden="true" /><strong>{title}</strong><span>{text}</span><ChevronRight className="cash-arrow" aria-hidden="true" /></Link>
    )}</nav>
    <section><header className="cash-summary-head"><h2><ChartNoAxesCombined />Resumen de tu jornada</h2><span><CalendarDays />Hoy, {dateLabel.format(new Date())}</span></header>
      <div className="cash-stats">{stats.map(({ label, value, icon: Icon }) => <div key={label}><Icon aria-hidden="true" /><div><span>{label}</span><strong>{value ?? '—'}</strong></div></div>)}</div>
      {error && <p role="status">No se pudo actualizar el resumen.</p>}
    </section>
    <p className="cash-note"><Info />Recuerda mantener el inventario actualizado y verificar los pedidos pendientes.</p>
  </div>;
}
