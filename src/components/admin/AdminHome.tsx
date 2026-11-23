import { BarChart3, Boxes, CalendarDays, ChevronRight, ClipboardList, PlusCircle, Tag, Users, UserPlus, BookOpen, Settings } from "lucide-react";
import type { AdminSection } from "./AdminLayout";
import WelcomeBanner from './WelcomeBanner';

type Shortcut = { id: AdminSection; title: string; icon: typeof Boxes };
const daily: Shortcut[] = [
  { id: "registrar-venta", title: "Registrar venta", icon: PlusCircle },
  { id: "pedidos", title: "Pedidos", icon: ClipboardList },
  { id: "inventario", title: "Inventario", icon: Boxes },
];
const management: Shortcut[] = [
  { id: "productos", title: "Productos", icon: BookOpen },
  { id: "clientes", title: "Clientes", icon: Users },
  { id: "cumpleanos", title: "Cumpleaños", icon: CalendarDays },
  { id: "promociones", title: "Promociones", icon: Tag },
  { id: "estadisticas", title: "Estadísticas", icon: BarChart3 },
  { id: "usuarios", title: "Usuarios", icon: UserPlus },
];

export default function AdminHome({ onNavigate }: { onNavigate: (section: AdminSection) => void }) {
  const shortcut = ({ id, title, icon: Icon }: Shortcut) => <button key={id} type="button" onClick={() => onNavigate(id)} className="home-shortcut group"><span className="home-shortcut-icon"><Icon size={35} strokeWidth={1.8} /></span><span>{title}</span></button>;
  return <div className="cash-home admin-home">
    <WelcomeBanner />
    <nav className="cash-actions" aria-label="Operación diaria">{daily.map(({ id, title, icon: Icon }) => <button key={id} type="button" onClick={() => onNavigate(id)}><Icon className="cash-action-icon" aria-hidden="true"/><strong>{title}</strong><span>{id === 'registrar-venta' ? 'Realiza una nueva venta de productos.' : id === 'pedidos' ? 'Consulta y gestiona los pedidos.' : 'Consulta y gestiona las existencias.'}</span><ChevronRight className="cash-arrow" aria-hidden="true"/></button>)}</nav>
    <section className="home-shortcut-section"><div className="home-section-heading"><span><Settings size={20} /></span><h3>Administración del negocio</h3><i aria-hidden="true" /></div><div lang="es" className="home-shortcuts home-shortcuts-management">{management.map(shortcut)}</div></section>
  </div>;
}
