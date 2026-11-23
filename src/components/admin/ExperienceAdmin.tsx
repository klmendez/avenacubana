import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type EventRow = { id: string; title: string; description: string; starts_at: string; image_url: string | null; published: boolean };
type ReviewRow = { id: string; name: string; rating: number; comment: string; approved: boolean; created_at: string };

export default function ExperienceAdmin({ reviewsOnly = false }: { reviewsOnly?: boolean }) {
  const [events, setEvents] = useState<EventRow[]>([]); const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [form, setForm] = useState({ title: '', description: '', starts_at: '', image_url: '', published: false });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState('');
  const load = useCallback(async () => {
    if (!supabase) { setLoadError('No hay conexión con la base de datos.'); setLoading(false); return; }
    setLoading(true);
    const [eventsResult, reviewsResult] = await Promise.all([
      reviewsOnly ? null : supabase.from('events').select('*').order('starts_at'),
      supabase.from('reviews').select('id,name,rating,comment,approved,created_at')
        .order('approved').order('created_at', { ascending: false }),
    ]);
    if (eventsResult?.data) setEvents(eventsResult.data);
    if (reviewsResult.data) setReviews(reviewsResult.data);
    setLoadError(reviewsResult.error?.message || eventsResult?.error?.message || '');
    setLoading(false);
  }, [reviewsOnly]);
  useEffect(() => { void load(); }, [load]);
  const moderate = async (review: ReviewRow) => {
    if (!supabase || savingId) return;
    setSavingId(review.id);
    setMessage('');
    try {
      const approved = !review.approved;
      const { error } = await supabase.from('reviews').update({ approved }).eq('id', review.id).select('id').single();
      if (error) throw error;
      setMessage(approved ? 'Reseña aprobada y publicada.' : 'Reseña oculta.');
      await load();
    } catch {
      setMessage('No se pudo actualizar la reseña. Inténtalo de nuevo.');
    } finally {
      setSavingId('');
    }
  };
  const create = async (event: FormEvent) => { event.preventDefault(); if (!supabase) return; const { error } = await supabase.from('events').insert({ ...form, image_url: form.image_url || null, starts_at: new Date(form.starts_at).toISOString() }); setMessage(error?.message || 'Evento guardado.'); if (!error) { setForm({ title: '', description: '', starts_at: '', image_url: '', published: false }); await load(); } };
  const update = async (table: 'events', id: string, patch: Record<string, unknown>) => { if (!supabase) return; const { error } = await supabase.from(table).update(patch).eq('id', id); setMessage(error?.message || 'Cambio guardado.'); if (!error) await load(); };
  const remove = async (table: 'events'|'reviews', id: string) => { if (!supabase || !window.confirm('¿Eliminar este registro?')) return; const { error } = await supabase.from(table).delete().eq('id', id); setMessage(error?.message || 'Registro eliminado.'); if (!error) await load(); };
  return <div className="space-y-10">{!reviewsOnly && <section><h2 className="font-serif text-3xl">Eventos</h2><form onSubmit={create} className="mt-5 grid gap-4 border-t-4 border-[#086bb1] bg-[#e9f6ff] p-5 md:grid-cols-2"><label className="text-xs font-semibold uppercase">Título<input required value={form.title} onChange={e => setForm({...form,title:e.target.value})} className="mt-2 w-full border p-2 normal-case" /></label><label className="text-xs font-semibold uppercase">Fecha y hora<input required type="datetime-local" value={form.starts_at} onChange={e => setForm({...form,starts_at:e.target.value})} className="mt-2 w-full border p-2 normal-case" /></label><label className="text-xs font-semibold uppercase md:col-span-2">Descripción<textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})} className="mt-2 w-full border p-2 normal-case" /></label><label className="text-xs font-semibold uppercase">Imagen (URL)<input value={form.image_url} onChange={e => setForm({...form,image_url:e.target.value})} className="mt-2 w-full border p-2 normal-case" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={e => setForm({...form,published:e.target.checked})} /> Publicar de inmediato</label><button className="bg-[#086bb1] px-5 py-3 font-semibold text-white md:col-span-2">Crear evento</button></form><div className="mt-4 divide-y border-y">{events.map(item => <div key={item.id} className="flex items-start gap-3 py-4"><div className="min-w-0 flex-1"><b>{item.title}</b><p className="text-sm text-gray-600">{new Date(item.starts_at).toLocaleString('es-CO')} · {item.published ? 'Publicado' : 'Borrador'}</p></div><button onClick={() => void update('events',item.id,{published:!item.published})} className="border px-3 py-2 text-xs font-semibold">{item.published?'Ocultar':'Publicar'}</button><button onClick={() => void remove('events',item.id)} aria-label="Eliminar evento" className="p-2 text-red-700"><Trash2 size={17}/></button></div>)}{!events.length && <p className="py-6 text-sm text-gray-500">No hay eventos.</p>}</div></section>}
  <section aria-label="Moderación de reseñas">
    {!reviewsOnly && <h2 className="font-serif text-3xl">Reseñas</h2>}
    {loadError && <p role="alert">{loadError} <button type="button" className="underline" onClick={() => void load()}>Reintentar</button></p>}
    <ul className="divide-y divide-sky-100">{reviews.map(item => (
      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0 flex-1 basis-64">
          <strong>{item.name}</strong> · <span>{item.rating}/5</span>
          <p className="my-1 whitespace-pre-wrap break-words text-sm">{item.comment}</p>
          <small>{item.approved ? 'Publicada' : 'Pendiente de aprobación'}</small>
        </div>
        <button type="button" disabled={Boolean(savingId)} onClick={() => void moderate(item)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 px-4 text-sm font-semibold text-[#086bb1] disabled:opacity-50">
          {!item.approved && <Check size={17} aria-hidden="true" />}
          {savingId === item.id ? 'Guardando…' : item.approved ? 'Ocultar reseña' : 'Aprobar reseña'}
        </button>
        {!reviewsOnly && <button type="button" onClick={() => void remove('reviews', item.id)} aria-label="Eliminar reseña" className="p-2 text-red-700"><Trash2 size={17}/></button>}
      </li>
    ))}</ul>
    {loading && <p role="status">Cargando reseñas…</p>}
    {!loading && !loadError && !reviews.length && <p className="py-6 text-sm text-gray-500">Todavía no hay reseñas.</p>}
  </section>
  {message && <p role="status" className="text-sm font-semibold text-[#086bb1]">{message}</p>}</div>;
}
