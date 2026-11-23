import { useEffect, useRef, useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { cop } from '../../lib/format';
import type { AdminSection } from './AdminLayout';

type Notice = { id: string; created_at: string; label: string; detail: string };
type Tab = 'pedidos' | 'inventario';
type Stock = { id: string; name: string; unit: string; quantity: number; minimum_quantity: number };

export default function AdminNotifications({ onNavigate }: { onNavigate: (section: AdminSection) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('pedidos');
  const [orders, setOrders] = useState<Notice[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [read, setRead] = useState<{ pedidos: string[] }>({ pedidos: [] });
  const [storageKey, setStorageKey] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const previousOrders = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const soundBuffer = useRef<Promise<AudioBuffer> | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  const playSound = async () => {
    const context = audio.current;
    if (!context || context.state !== 'running') throw new Error('Sonido no activado');
    try {
      soundBuffer.current ??= fetch('/audio/notificacion-pedido.mp3').then(response => {
        if (!response.ok) throw new Error('No se pudo cargar el sonido.');
        return response.arrayBuffer();
      }).then(buffer => context.decodeAudioData(buffer));
      const buffer = await soundBuffer.current;
      if (context.state !== 'running') throw new Error('Sonido no activado');
      const source = context.createBufferSource(); const gain = context.createGain();
      source.buffer = buffer; gain.gain.value = 2;
      source.connect(gain); gain.connect(context.destination); source.start();
    } catch (error) { soundBuffer.current = null; throw error; }
  };
  const enableSound = async () => {
    try { audio.current ??= new AudioContext(); await audio.current.resume(); if (audio.current.state !== 'running') throw new Error('Sonido bloqueado'); await playSound(); setSoundEnabled(true); }
    catch { setSoundEnabled(false); setError('No se pudo activar el sonido en este navegador.'); }
  };

  useEffect(() => {
    const unlock = () => {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().then(() => setSoundEnabled(audio.current?.state === 'running')).catch(() => {});
      } catch { /* El botón permite volver a intentarlo. */ }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    let alive = true;
    let key = '';
    let initialized = false;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        if (!key) {
          const { data: session } = await db.auth.getUser();
          if (!session.user) throw new Error('Sesión no disponible');
          key = `avena-cubana-notifications-${session.user.id}`;
          if (alive) setStorageKey(key);
        }
        const [orderResult, stockResult] = await Promise.all([
          db.from('orders').select('id,order_number,total,created_at').eq('business','la_tuba').order('created_at',{ascending:false}).limit(50),
          db.from('inventory_items').select('id,name,unit,quantity,minimum_quantity').order('name'),
        ]);
        if (orderResult.error || stockResult.error) throw new Error('No se pudieron cargar las notificaciones.');
        if (!alive) return;
        const nextOrders = (orderResult.data ?? []).map(row => ({ id: row.id, created_at: row.created_at, label: `Pedido ${row.order_number}`, detail: cop(row.total) }));
        if (!initialized) {
          try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null');
            const nextRead = saved && Array.isArray(saved.pedidos) ? { pedidos: saved.pedidos } : { pedidos: nextOrders.map(row => row.id) };
            setRead(nextRead); readRef.current = nextRead; localStorage.setItem(key, JSON.stringify(nextRead));
          } catch { const nextRead = { pedidos: nextOrders.map(row => row.id) }; setRead(nextRead); readRef.current = nextRead; }
          initialized = true;
        } else if (previousOrders.current && nextOrders.some(row => !previousOrders.current!.has(row.id))) void playSound().catch(() => { if (alive) setSoundEnabled(false); });
        previousOrders.current = new Set(nextOrders.map(row => row.id));
        setOrders(nextOrders); setStock((stockResult.data ?? []).filter(item => Number(item.quantity) <= Number(item.minimum_quantity)));
        setError(''); setLoading(false);
      } catch { if (alive) { setError('No se pudieron actualizar las notificaciones.'); setLoading(false); } }
      finally { inFlight = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    const channel = db.channel(`admin-notifications-${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => void load()).subscribe();
    return () => { alive = false; window.clearInterval(timer); void db.removeChannel(channel); void audio.current?.close(); audio.current = null; soundBuffer.current = null; previousOrders.current = null; };
  }, []);

  const unreadOrders = orders.filter(row => !read.pedidos.includes(row.id)).length;
  const unread = unreadOrders;
  const markRead = (kind: 'pedidos') => {
    const ids = orders.map(row => row.id);
    const next = { ...readRef.current, [kind]: [...new Set([...ids, ...readRef.current[kind]])].slice(0, 300) };
    readRef.current = next; setRead(next);
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* La marca se conserva mientras la pestaña esté abierta. */ }
  };
  const go = (section: AdminSection) => { setOpen(false); if (window.location.pathname !== '/admin') navigate(`/admin?seccion=${section}`); else onNavigate(section); };
  const rows = orders;
  return <div className="relative"><button type="button" onClick={() => setOpen(value => !value)} aria-label={`Notificaciones: ${unread} sin leer`} aria-expanded={open} className="relative p-2 text-[#061d70]"><Bell size={19} />{unread > 0 && <span className="absolute right-0 top-0 rounded-full bg-[#087fc7] px-1 text-[10px] leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section aria-label="Notificaciones" className="absolute right-0 top-full z-50 w-80 max-w-[88vw] border border-[#b6d9ed] bg-[#e9f6ff] p-4 shadow-lg"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Notificaciones</h2><button type="button" onClick={() => void enableSound()} className="inline-flex items-center gap-1 text-xs text-[#087fc7]"><Volume2 size={15} />{soundEnabled ? 'Sonido activo' : 'Activar sonido'}</button></div>
      <div role="tablist" className="mt-3 flex gap-3 border-b border-[#b6d9ed]">{([{id:'pedidos', label:`Pedidos (${unreadOrders})`},{id:'inventario',label:`Inventario (${stock.length})`}] as const).map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} type="button" onClick={() => setTab(item.id)} className={`border-b-2 py-2 text-xs ${tab === item.id ? 'border-[#087fc7] font-semibold' : 'border-transparent text-[#526d80]'}`}>{item.label}</button>)}</div>
      <p className="mt-2 text-[11px] text-[#526d80]">El sonido avisa pedidos nuevos mientras el panel está abierto.</p>
      {loading && <p className="mt-3 text-xs">Cargando…</p>}{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
      {tab !== 'inventario' ? <><div className="max-h-60 overflow-y-auto">{rows.map(row => <button key={row.id} type="button" onClick={() => { markRead(tab); go('pedidos'); }} className="block w-full border-b border-[#e5d6bf] py-2 text-left text-xs"><span className="block font-medium">{!read[tab].includes(row.id) && <span aria-label="Sin leer">● </span>}{row.label}</span><span className="text-[#526d80]">{row.detail} · {new Date(row.created_at).toLocaleString('es-CO', {timeZone:'America/Bogota'})}</span></button>)}{!loading && !rows.length && <p className="py-4 text-xs text-[#526d80]">No hay {tab} recientes.</p>}</div>{rows.length > 0 && <button type="button" onClick={() => markRead(tab)} className="mt-3 text-xs font-semibold text-[#087fc7] underline">Marcar como vistas</button>}</> : <><div className="max-h-52 overflow-y-auto">{stock.map(item => <p key={item.id} className="border-b border-[#e5d6bf] py-2 text-xs">{item.name} · {Number(item.quantity)} {item.unit} (mínimo {Number(item.minimum_quantity)})</p>)}{!loading && !stock.length && <p className="py-4 text-xs text-[#526d80]">No hay insumos por debajo del mínimo.</p>}</div><button type="button" onClick={() => go('inventario')} className="mt-3 text-xs font-semibold text-[#087fc7] underline">Ir a inventario</button></>}
    </section>}
  </div>;
}
