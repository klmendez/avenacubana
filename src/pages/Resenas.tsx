import { useEffect, useState, type FormEvent } from "react";
import { Star } from "lucide-react";
import { supabase } from "../lib/supabase";
import { submissionIdentity, completeSubmission } from "../lib/submission";

type Review = { id: string; name: string; rating: number; comment: string };
export default function Resenas() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [form, setForm] = useState({ name: "", rating: 5, comment: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (supabase) void supabase.from("reviews").select("id,name,rating,comment").eq("approved", true).order("created_at", { ascending: false }).limit(12).then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("No pudimos cargar las reseñas. Inténtalo más tarde.");
      else setReviews(data ?? []);
    });
    return () => { active = false; };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) { setMessage("No hay conexión para enviar tu reseña."); return; }
    if (busy) return;
    setBusy(true); setMessage("");
    const payload = { name: form.name.trim(), rating: form.rating, comment: form.comment.trim() };
    const identity = submissionIdentity("review", payload);
    const { error } = await supabase.rpc("submit_review", { p_name: payload.name, p_rating: payload.rating, p_comment: payload.comment, p_request_id: identity.requestId });
    setBusy(false);
    if (error) { setMessage("No pudimos enviar tu reseña. Inténtalo de nuevo."); return; }
    completeSubmission("review"); setForm({ name: "", rating: 5, comment: "" });
    setMessage("Gracias. Tu reseña quedó pendiente de aprobación.");
  };
  return <main className="min-h-dvh bg-crema px-5 pb-20 pt-24 text-slate-800 sm:pt-32">
    <div className="mx-auto max-w-5xl">
      <header className="text-center"><p className="text-xs font-bold uppercase tracking-[.2em] text-rojo">Avena Cubana Pop</p><h1 className="mt-3 text-3xl font-bold text-rojo-dark sm:text-4xl">Tu opinión nos importa</h1><p className="mt-3 text-sm text-slate-600 sm:text-base">Comparte cómo disfrutaste nuestros productos.</p></header>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section><h2 className="text-xl font-semibold text-rojo-dark">Lo que cuentan nuestros clientes</h2>{reviews.length ? reviews.map(review => <blockquote key={review.id} className="mt-4 rounded-2xl bg-white p-5 shadow-sm"><div className="flex gap-1 text-amber-500" aria-label={`${review.rating} de 5 estrellas`}>{Array.from({ length: review.rating }, (_, i) => <Star key={i} size={16} fill="currentColor" />)}</div><p className="mt-3 leading-relaxed">{review.comment}</p><footer className="mt-2 text-sm font-semibold">{review.name}</footer></blockquote>) : <p className="mt-4 text-sm text-slate-600">Aún no hay reseñas publicadas.</p>}</section>
        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold text-rojo-dark">Deja tu reseña</h2><label className="mt-4 block text-sm font-medium">Nombre<input required minLength={2} maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2" /></label><label className="mt-4 block text-sm font-medium">Calificación<select value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2">{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} estrellas</option>)}</select></label><label className="mt-4 block text-sm font-medium">Comentario<textarea required minLength={5} maxLength={2000} rows={4} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} className="mt-1 w-full rounded-lg border border-blue-200 px-3 py-2" /></label><button disabled={busy} className="mt-5 w-full rounded-full bg-rojo px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Enviando..." : "Enviar reseña"}</button>{message && <p role="status" className="mt-3 text-sm text-rojo-dark">{message}</p>}</form>
      </div>
    </div>
  </main>;
}
