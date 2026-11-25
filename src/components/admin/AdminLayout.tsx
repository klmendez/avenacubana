import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Landmark, UserCircle, ChevronDown, BarChart3, Boxes, Calendar, ChevronLeft, ChevronRight, Download, Home, LogOut, Maximize, Minimize, Menu, Package, PlusCircle, Star, Tag, UserPlus, Users, Utensils, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import BrebNotices from "./BrebNotices";
import AdminNotifications from './AdminNotifications';

export type AdminSection = "inicio" | "mesas" | "tomar-pedido" | "inventario" | "reservas" | "carta-bebidas" | "registrar-venta" | "pedidos-menu" | "pedidos-carta" | "pedidos-bebidas" | "pedidos" | "clientes" | "cumpleanos" | "estadisticas" | "productos" | "categorias" | "promociones" | "menu-dia" | "experiencia" | "resenas" | "usuarios" | "breb";

type Props = { cashierHome?: boolean; accountLabel?: string; allowedSections?: AdminSection[]; pageTitle?: string; pageDescription?: string; activeSection?: AdminSection; onChangeSection?: (section: AdminSection) => void; onExportCSV?: () => void; children: React.ReactNode };

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const sections = [
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "registrar-venta", label: "Registrar venta", icon: PlusCircle },
  { id: "tomar-pedido", label: "Tomar pedido", icon: PlusCircle },
  { id: "mesas", label: "Pedidos por mesas", icon: Utensils },
  { id: "breb", label: "Avisos Bre-B", icon: Landmark },
  { id: "usuarios", label: "Usuarios", icon: UserPlus },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "cumpleanos", label: "Cumpleaños", icon: Calendar },
  { id: "productos", label: "Productos", icon: Package },
  { id: "inventario", label: "Inventario", icon: Boxes },
  { id: "promociones", label: "Promociones", icon: Tag },
  { id: "resenas", label: "Reseñas", icon: Star },
  { id: "estadisticas", label: "Estadísticas", icon: BarChart3 },
] as const;

export function sidebarSection(value: string | null): AdminSection {
  return value === "pedidos" ? value : sections.find(section => section.id === value)?.id ?? "inicio";
}

const primarySections = sections.slice(0, 2);
const managementSections = sections.slice(2);

const pageDetails: Partial<Record<AdminSection, { description: string; icon: typeof Home }>> = {
  breb: { description: "Historial de transferencias notificadas por correo.", icon: Landmark },
  inicio: { description: "Todo lo que necesitas para gestionar tu negocio.", icon: Home },
  mesas: { description: "Consulta las mesas y toma pedidos.", icon: Utensils },
  "tomar-pedido": { description: "Selecciona los productos y deja el pedido listo para caja.", icon: PlusCircle },
  inventario: { description: "Gestiona las existencias de tus productos.", icon: Boxes },
  productos: { description: "Administra tus productos, precios e imágenes.", icon: Package },
  "registrar-venta": { description: "Selecciona los productos y registra cada venta.", icon: PlusCircle },
  pedidos: { description: "Consulta y administra los pedidos de tus clientes.", icon: Package },
  usuarios: { description: "Crea accesos para el personal de caja y de turnos.", icon: UserPlus },
  clientes: { description: "Consulta la información y los pedidos de tus clientes.", icon: Users },
  cumpleanos: { description: "Consulta las fechas especiales de tus clientes.", icon: Calendar },
  promociones: { description: "Administra los descuentos y promociones de tu negocio.", icon: Tag },
  resenas: { description: "Revisa las opiniones de los clientes y aprueba su publicación.", icon: Star },
  estadisticas: { description: "Consulta los resultados y movimientos de tu negocio.", icon: BarChart3 },
};

const titles: Record<AdminSection, string> = {
  ...Object.fromEntries(sections.map((item) => [item.id, item.label])),
  "pedidos-menu": "Pedidos · Menú del día",
  "pedidos-carta": "Pedidos · Nuestra carta",
  "pedidos-bebidas": "Pedidos · Bebidas",
  pedidos: "Todos los pedidos",
} as Record<AdminSection, string>;

export default function AdminLayout({ cashierHome = false, accountLabel, allowedSections, pageTitle, pageDescription, activeSection = "pedidos", onChangeSection: changeSection, onExportCSV, children }: Props) {
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      header.parentElement?.style.setProperty('--admin-header-height', header.offsetHeight + 'px');
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  const onChangeSection = changeSection ?? ((section: AdminSection) => navigate(`/admin?seccion=${section}`));
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState("");
  useEffect(() => {
    const doc = document as FullscreenDocument;
    const sync = () => setFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    sync();
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("webkitfullscreenchange", sync);
    return () => { doc.removeEventListener("fullscreenchange", sync); doc.removeEventListener("webkitfullscreenchange", sync); };
  }, []);
  const toggleFullscreen = async () => {
    const doc = document as FullscreenDocument;
    const root = doc.documentElement as FullscreenElement;
    setFullscreenMessage("");
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else if (root.requestFullscreen) await root.requestFullscreen();
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      else setFullscreenMessage("Tu navegador no permite activar pantalla completa en esta página.");
    } catch {
      setFullscreenMessage("No se pudo cambiar a pantalla completa. Revisa la configuración de tu navegador.");
    }
  };
  const [compactDesktop, setCompactDesktop] = useState(() => {
    try { return localStorage.getItem("avena-sidebar-compact") === "true"; }
    catch { return false; }
  });
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const collapsed = desktop && compactDesktop;
  const toggleSidebar = () => {
    const compact = !compactDesktop;
    setCompactDesktop(compact);
    try { localStorage.setItem("avena-sidebar-compact", String(compact)); }
    catch { /* La preferencia sigue activa en esta vista. */ }
  };
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => { void supabase?.auth.getUser().then(({ data }) => setUserEmail(data.user?.email || "")); }, []);
  useEffect(() => { const timer = window.setTimeout(() => setOpen(false), 0); return () => window.clearTimeout(timer); }, [activeSection]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const resize = () => { setDesktop(media.matches); setOpen(false); };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);

  const detail = pageDetails[activeSection] ?? { description: "Gestiona tu negocio desde este espacio.", icon: Package };
  const PageIcon = detail.icon;
  const ordersLabel = allowedSections?.includes("registrar-venta") ? "Pedidos y Mesas" : "Pedidos";

  return <div className={`admin-theme min-h-dvh bg-[#dcefff] text-[#071e55] ${collapsed ? "admin-sidebar-collapsed" : ""}`}>
    {open && <button type="button" aria-label="Cerrar navegación" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-[#061d70]/50 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[min(17rem,88vw)] flex-col bg-[#041d40] text-[#fff4dc] transition-all h-dvh ${collapsed ? "lg:w-20" : "lg:w-[17rem]"} ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
      <div className={`admin-sidebar-brand flex shrink-0 items-center border-b border-[#fff4dc]/15 ${collapsed ? "h-20 flex-col justify-center gap-1 px-1" : "h-20 justify-between px-4"}`}>
        <Link to="/" className="flex min-w-0 items-center gap-3"><img src="/avena-cubana-logo.png" alt="Avena Cubana Pop" className={`${collapsed ? "h-9 w-9" : "h-12 w-12"} shrink-0 rounded-full object-cover`} />{!collapsed && <span><b className="block font-serif text-lg leading-none">Avena Cubana Pop</b><small className="mt-1 block text-xs text-[#c6eaff]">Administración</small></span>}</Link>
        <button type="button" onClick={toggleSidebar} className="hidden p-2 text-[#c6eaff] hover:bg-white/10 lg:block" aria-label={collapsed ? "Expandir menú" : "Comprimir menú"} title={collapsed ? "Expandir menú" : "Comprimir menú"}>{collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}</button>
        <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar menú" className="p-2 lg:hidden"><X size={20} /></button>
      </div>
      <nav className="admin-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3">{!collapsed && <p className="px-3 pb-3 text-xs font-medium text-[#a8d8f3]">Gestión de Avena Cubana</p>}<div className="space-y-1">
        {primarySections.filter(s => !allowedSections || allowedSections.includes(s.id)).map((section) => { const Icon = section.icon; const active = activeSection === section.id; return <button key={section.id} type="button" onClick={() => onChangeSection(section.id)} className={`flex w-full items-center px-3 py-3 text-left text-sm transition ${collapsed ? "justify-center" : "gap-3"} ${active ? "bg-[#fff4dc] font-semibold text-[#061d70]" : "text-[#d5eafa] hover:bg-white/10 hover:text-white"}`} title={collapsed ? section.label : undefined}><Icon size={18} />{!collapsed && <span>{section.label}</span>}{active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#087fc7]" />}</button>; })}
        {(!allowedSections || allowedSections.includes("pedidos")) && <button type="button" onClick={() => onChangeSection("pedidos")} className={`flex w-full items-center px-3 py-3 text-left text-sm transition ${collapsed ? "justify-center" : "gap-3"} ${activeSection === "pedidos" ? "bg-[#fff4dc] font-semibold text-[#061d70]" : "text-[#d5eafa] hover:bg-white/10 hover:text-white"}`} title={collapsed ? ordersLabel : undefined}><Package size={18} />{!collapsed && <span>{ordersLabel}</span>}</button>}
        {managementSections.filter(s => allowedSections ? allowedSections.includes(s.id) : s.id !== "mesas" && s.id !== "tomar-pedido").map((section) => { const Icon = section.icon; const active = activeSection === section.id; return <button key={section.id} type="button" onClick={() => onChangeSection(section.id)} className={`flex w-full items-center px-3 py-3 text-left text-sm transition ${collapsed ? "justify-center" : "gap-3"} ${active ? "bg-[#fff4dc] font-semibold text-[#061d70]" : "text-[#d5eafa] hover:bg-white/10 hover:text-white"}`} title={collapsed ? section.label : undefined}><Icon size={18} />{!collapsed && <span>{section.label}</span>}{active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#087fc7]" />}</button>; })}
      </div></nav>
      <div className="border-t border-[#fff4dc]/15 p-3"><Link to="/" title={collapsed ? "Ver sitio" : undefined} className={`flex items-center px-3 py-2.5 text-sm text-[#d5eafa] hover:bg-white/10 ${collapsed ? "justify-center" : "gap-3"}`}><Home size={17} />{!collapsed && "Ver sitio"}</Link><button type="button" title={collapsed ? "Cerrar sesión" : undefined} onClick={() => { void supabase?.auth.signOut(); }} className={`mt-1 flex w-full items-center px-3 py-2.5 text-left text-sm text-[#d5eafa] hover:bg-white/10 ${collapsed ? "justify-center" : "gap-3"}`}><LogOut size={17} />{!collapsed && "Cerrar sesión"}</button></div>
    </aside>
    <div className="admin-main min-w-0" data-home={activeSection === "inicio" || undefined}>
      <header ref={headerRef} className="admin-page-header sticky top-0 z-30 flex items-start justify-between gap-4 bg-[#dcefff]/95 px-4 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-7">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4"><button type="button" onClick={() => setOpen(true)} className="shrink-0 p-2 text-[#061d70] lg:hidden" aria-label="Abrir navegación"><Menu size={21} /></button><PageIcon size={36} aria-hidden="true" className="shrink-0 text-[#087fc7]" /><div className="min-w-0"><h1 className="wrap-break-word text-[clamp(1.25rem,1.6vw,1.55rem)] font-semibold leading-tight text-[#061d70]">{pageTitle ?? titles[activeSection] ?? "Administración"}</h1><p className="mt-1 text-sm text-[#526d80]">{pageDescription ?? detail.description}</p></div></div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2"><button type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#061d70] hover:bg-[#c6eaff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#087fc7]">{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>{(!allowedSections || cashierHome) && <AdminNotifications onNavigate={onChangeSection} />}{onExportCSV && <button type="button" onClick={onExportCSV} className="inline-flex items-center gap-2 px-2 py-2 text-xs font-medium text-[#061d70] hover:text-[#087fc7]"><Download size={16} /><span className="hidden sm:inline">Exportar</span></button>}{accountLabel ? <details className="cash-account"><summary><UserCircle /><span>{accountLabel}</span><ChevronDown size={16}/></summary><div><p>{userEmail}</p><button type="button" onClick={() => void supabase?.auth.signOut()}>Cerrar sesión</button></div></details> : <span className="hidden max-w-48 truncate text-xs text-[#526d80] md:block">{userEmail}</span>}</div>
      </header>
      {fullscreenMessage && <p role="status" className="mx-4 mb-2 text-sm text-[#8a3200]">{fullscreenMessage}</p>}
      <main className="admin-content px-3 pb-6 pt-1 sm:px-5 lg:px-6">{(!allowedSections || allowedSections.includes("breb")) && <BrebNotices showHistory={activeSection === "breb"} />}{children}</main>
    </div>
  </div>;
}
