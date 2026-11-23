import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Volume2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Notice = { id: number; received_at: string; amount: number; payer: string; account_last4: string | null };
const fields = "id,received_at,amount,payer,account_last4";
const money = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" });
const pageSize = 20;
const greetingKey = "avena-breb-voice-welcomed";
let greetedThisSession = false;
const phrase = (n: Pick<Notice, "amount" | "payer">) => `Recibiste ${money.format(n.amount)} pesos de ${n.payer}.`;

function speak(text: string, report: (error: string) => void) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-CO";
  utterance.onerror = event => {
    if (event.error !== "interrupted" && event.error !== "canceled") report("El navegador no pudo reproducir el aviso. Puedes repetirlo.");
  };
  window.speechSynthesis.speak(utterance);
}

export default function BrebNotices({ showHistory }: { showHistory: boolean }) {
  const [history, setHistory] = useState<Notice[]>([]);
  const [latest, setLatest] = useState<Notice | null>(null);
  const [previous, setPrevious] = useState<number[]>([]);
  const before = previous.at(-1);
  const [more, setMore] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [audioError, setAudioError] = useState("");
  const [loading, setLoading] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem("avena-breb-voice") !== "off"; }
    catch { return true; }
  });
  const [since, setSince] = useState("");
  const activated = useRef(false);
  const mountedAt = useRef(new Date().toISOString());
  const [banner, setBanner] = useState<Notice | null>(null);
  const lastSeen = useRef<number | null>(null);
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    if (!voiceEnabled || !canSpeak) return;
    let active = true;
    const enableAnnouncements = () => {
      if (active) { setAudioError(""); setSince(mountedAt.current); }
    };
    const unlock = () => {
      if (activated.current) return;
      activated.current = true;
      const greetOnce = () => {
        if (!active) return;
        let greeted = greetedThisSession;
        try { greeted ||= localStorage.getItem(greetingKey) === "1"; }
        catch { /* Usa la memoria de esta sesión. */ }
        if (greeted) { enableAnnouncements(); return; }
        greetedThisSession = true;
        try { localStorage.setItem(greetingKey, "1"); } catch { /* Almacenamiento restringido. */ }
        const utterance = new SpeechSynthesisUtterance("Voz de caja activada.");
        utterance.lang = "es-CO";
        utterance.onend = enableAnnouncements;
        utterance.onerror = () => {
          if (!active) return;
          activated.current = false;
          setAudioError("Toca la pantalla para activar la voz de caja.");
        };
        window.speechSynthesis.speak(utterance);
      };
      if (navigator.locks) void navigator.locks.request(greetingKey, greetOnce).catch(greetOnce);
      else greetOnce();
    };
    const timer = navigator.userActivation?.hasBeenActive ? window.setTimeout(unlock, 0) : undefined;
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      activated.current = false;
      window.speechSynthesis.cancel();
    };
  }, [voiceEnabled, canSpeak]);

  useEffect(() => {
    const db = supabase;
    if (!db) { setSourceError("No hay conexión con Supabase."); return; }
    let alive = true;
    let busy = false;
    setLoading(true);
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const head = await db.from("breb_notices").select(fields).order("id", { ascending: false }).limit(showHistory && !before ? pageSize + 1 : 1);
        if (head.error) throw head.error;
        if (!alive) return;
        const newest = head.data[0];
        setLatest(newest ?? null);
        if (newest && lastSeen.current !== null && newest.id > lastSeen.current) setBanner(newest);
        lastSeen.current = newest?.id ?? 0;
        if (showHistory) {
          const result = before ? await db.from("breb_notices").select(fields).lt("id", before).order("id", {ascending:false}).limit(pageSize + 1) : head;
          if (result.error) throw result.error;
          if (!alive) return;
          setHistory(result.data.slice(0,pageSize)); setMore(result.data.length > pageSize);
        }
        setSourceError("");
      } catch {
        if (alive) setSourceError("No pudimos actualizar los avisos. Reintentando…");
      } finally { busy = false; if (alive) setLoading(false); }
    };
    void poll();
    const interval = window.setInterval(poll, 8000);
    return () => { alive = false; clearInterval(interval); };
  }, [before, showHistory]);

  useEffect(() => {
    if (!since || !supabase) return;
    const db = supabase;
    let active = true;
    let busy = false;
    const announce = async () => {
      if (busy || document.visibilityState !== "visible" || window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
      busy = true;
      try {
        const { data, error } = await db.rpc("claim_breb_announcement", { p_since: since });
        if (error) throw error;
        if (active && data?.[0]) speak(phrase(data[0]), setAudioError);
      } catch {
        if (active) setAudioError("No se pudo comprobar el siguiente aviso de voz. Reintentando…");
      } finally { busy = false; }
    };
    void announce();
    const timer = window.setInterval(announce, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [since]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 10000);
    return () => window.clearTimeout(timer);
  }, [banner]);
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, [canSpeak]);

  const notice = showHistory ? latest : banner;
  const senderSummary = notice && (
    <div role="status" className="mb-3 rounded-lg bg-sky-50 p-3 text-sm text-slate-900">
      <p className="font-semibold">{showHistory ? "Último aviso Bre-B" : "Nuevo aviso Bre-B"} · $ {money.format(notice.amount)}</p>
      <p className="break-words">Envió el dinero: <strong>{notice.payer}</strong></p>
      {!showHistory && <Link className="font-semibold underline" to="/admin?seccion=breb">Ver historial</Link>}
    </div>
  );
  if (!showHistory) return senderSummary;
  return <section className="mx-auto max-w-6xl space-y-4 py-3">
    {senderSummary}
    <p className="text-sm text-slate-600">Avisos informativos del correo. Verifica el ingreso en la app del banco antes de registrar el cobro.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!canSpeak} aria-pressed={voiceEnabled} className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => {
        setAudioError("");
        const enabled = !voiceEnabled;
        setVoiceEnabled(enabled);
        try { localStorage.setItem("avena-breb-voice", enabled ? "on" : "off"); } catch { /* Preferencia durante esta sesión. */ }
        if (!enabled) { setSince(""); window.speechSynthesis.cancel(); }
      }}><Volume2 size={18}/>{voiceEnabled ? "Desactivar voz" : "Activar voz en este equipo"}</button>
      <button type="button" disabled={!latest || !canSpeak} className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 disabled:opacity-50" onClick={() => { if (latest) speak(phrase(latest), setAudioError); }}><RotateCcw size={17}/>Repetir último aviso</button>
    </div>
    {voiceEnabled && canSpeak && !since && <p className="text-sm text-slate-600">La voz está habilitada. Toca la pantalla para comenzar a escuchar.</p>}
    {(!canSpeak || audioError || sourceError) && <p role="status">{sourceError || audioError || "Este navegador no tiene lectura en voz alta."}</p>}
    <div className="admin-data-table" role="region" aria-label="Historial de avisos Bre-B" tabIndex={0}><table><thead><tr><th>Recibido en Colombia</th><th>Quién envió</th><th>Valor</th><th>Cuenta receptora</th></tr></thead>
      <tbody>{!loading && history.map(n => <tr key={n.id}><td>{date.format(new Date(n.received_at))}</td><td>{n.payer}</td><td>$ {money.format(n.amount)}</td><td>{n.account_last4 ? "•••• " + n.account_last4 : "Sin dato"}</td></tr>)}</tbody></table></div>
    {loading ? <p>Cargando avisos…</p> : !sourceError && !history.length && <p>Todavía no hay avisos de Bre-B.</p>}
    {(before || more) && <nav aria-label="Páginas del historial" className="flex gap-3"><button type="button" disabled={!before || loading} onClick={() => setPrevious(previous.slice(0,-1))}>Anterior</button><button type="button" disabled={!more || loading} onClick={() => setPrevious([...previous, history[history.length-1].id])}>Siguiente</button></nav>}
  </section>;
}
