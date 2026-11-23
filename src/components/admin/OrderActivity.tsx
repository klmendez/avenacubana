import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Entry = { id: number; event: string; actor: string; created_at: string };
export default function OrderActivity({ orderId, revision }: { orderId: string; revision: number }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void supabase?.from('order_activity').select('id,event,actor,created_at').eq('order_id', orderId).order('id').then(result => {
      if (active) { setEntries(result.data ?? []); setError(result.error?.message ?? ''); }
    });
    return () => { active = false; };
  }, [orderId, revision]);
  return <section className="my-4"><h3 className="mb-2 font-semibold">Historial del pedido</h3>
    {error && <p role="alert">{error}</p>}
    {!entries.length && !error && <p className="text-sm">Sin actividad registrada.</p>}
    <ol className="divide-y">{entries.map(entry => <li key={entry.id} className="py-2 text-sm"><strong>{entry.event}</strong><br/>{entry.actor} · {new Date(entry.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</li>)}</ol>
  </section>;
}
