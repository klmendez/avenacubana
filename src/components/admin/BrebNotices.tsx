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

function speak(text: string, report: (error: string) => void, done?: () => void) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-CO";
  utterance.onend = () => done?.();
  utterance.onerror = event => {
    if (done || (event.error !== "interrupted" && event.error !== "canceled")) report("El navegador no pudo reproducir el aviso. Puedes repetirlo.");
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
  const [voiceReady, setVoiceReady] = useState(false);
  const unlockAudio = useRef<() => void>(() => {});
  const activated = useRef(false);
  const pendingId = useRef<number | null>(null);
  const [retryNotice, setRetryNotice] = useState<Pick<Notice, "id" | "amount" | "payer"> | null>(null);
  const playing = useRef(false);
  const [banner, setBanner] = useState<Notice | null>(null);
  const lastSeen = useRef<number | null>(null);
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  useEffect(() => {
    if (!voiceEnabled || !canSpeak) return;
    let active = true;
    const enableAnnouncements = () => {
      if (active) { setAudioError(""); setVoiceReady(true); }
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
    unlockAudio.current = unlock;
    let resume = greetedThisSession || navigator.userActivation?.hasBeenActive;
    try { resume ||= localStorage.getItem(greetingKey) === "1"; } catch { /* Usa la sesión. */ }
    const timer = resume ? window.setTimeout(unlock, 0) : undefined;
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

  function playClaimed(n: Pick<Notice, "id" | "amount" | "payer">) {
    if (playing.current) return;
    playing.current = true;
    setRetryNotice(null);
    setAudioError("");
    speak(phrase(n), () => {
      playing.current = false;
      setRetryNotice(n);
    }, () => {
      playing.current = false;
      pendingId.current = null;
      try { sessionStorage.removeItem("avena-breb-pending-id"); } catch { /* Usa la sesión. */ }
    });
  }
  useEffect(() => {
    if (!voiceReady || !voiceEnabled || !supabase || retryNotice) return;
    const db = supabase;
    let active = true;
    let busy = false;
    const announce = async () => {
      if (busy || playing.current || document.visibilityState !== "visible" || window.speechSynthesis.speaking || window.speechSynthesis.pending) return;
      busy = true;
      try {
        if (!pendingId.current) {
          try { pendingId.current = Number(sessionStorage.getItem("avena-breb-pending-id")) || null; } catch { /* Usa la sesión. */ }
        }
        if (pendingId.current) {
          const result = await db.from("breb_notices").select("id,amount,payer").eq("id", pendingId.current).maybeSingle();
          if (result.error) throw result.error;
          if (!active) return;
          if (result.data) { playClaimed(result.data); return; }
          pendingId.current = null;
          try { sessionStorage.removeItem("avena-breb-pending-id"); } catch { /* Usa la sesión. */ }
        }
        const { data, error } = await db.rpc("claim_breb_announcement", { p_since: new Date(0).toISOString() });
        if (error) throw error;
                if (data?.[0]) {
          pendingId.current = data[0].id;
          try { sessionStorage.setItem("avena-breb-pending-id", String(data[0].id)); } catch { /* Usa la sesión. */ }
          if (active) playClaimed(data[0]);
        }
      } catch {
        if (active) setAudioError("No se pudo comprobar el siguiente aviso de voz. Reintentando…");
      } finally { busy = false; }
    };
    void announce();
    const timer = window.setInterval(announce, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [voiceReady, voiceEnabled, retryNotice]);

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
  const audioAction = voiceEnabled && canSpeak && (retryNotice || !voiceReady) && (
    <button type="button" className="mb-2 rounded-full bg-sky-700 px-4 py-2 text-sm text-white"
      onClick={() => { if (retryNotice) playClaimed(retryNotice); else unlockAudio.current(); }}>
      {retryNotice ? "Escuchar transferencia pendiente" : "Activar sonido de avisos"}
    </button>
  );
  if (!showHistory) return <>{senderSummary}{audioAction}</>;
  return <section className="mx-auto max-w-6xl space-y-4 py-3">
    {senderSummary}
    {audioAction}
    <p className="text-sm text-slate-600">Avisos informativos del correo. Verifica el ingreso en la app del banco antes de registrar el cobro.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!canSpeak} aria-pressed={voiceEnabled} className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => {
        setAudioError("");
        const enabled = !voiceEnabled;
        setVoiceEnabled(enabled);
        try { localStorage.setItem("avena-breb-voice", enabled ? "on" : "off"); } catch { /* Preferencia durante esta sesión. */ }
        if (!enabled) { setVoiceReady(false); window.speechSynthesis.cancel(); }
      }}><Volume2 size={18}/>{voiceEnabled ? "Desactivar voz" : "Activar voz en este equipo"}</button>
      <button type="button" disabled={!latest || !canSpeak} className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-4 py-2 disabled:opacity-50" onClick={() => { if (latest) speak(phrase(latest), setAudioError); }}><RotateCcw size={17}/>Repetir último aviso</button>
    </div>
    {voiceEnabled && canSpeak && !voiceReady && <p className="text-sm text-slate-600">La voz está habilitada. Toca la pantalla para comenzar a escuchar.</p>}
    {(!canSpeak || audioError || sourceError) && <p role="status">{sourceError || audioError || "Este navegador no tiene lectura en voz alta."}</p>}
    <div className="admin-data-table" role="region" aria-label="Historial de avisos Bre-B" tabIndex={0}><table><thead><tr><th>Recibido en Colombia</th><th>Quién envió</th><th>Valor</th><th>Cuenta receptora</th></tr></thead>
      <tbody>{!loading && history.map(n => <tr key={n.id}><td>{date.format(new Date(n.received_at))}</td><td>{n.payer}</td><td>$ {money.format(n.amount)}</td><td>{n.account_last4 ? "•••• " + n.account_last4 : "Sin dato"}</td></tr>)}</tbody></table></div>
    {loading ? <p>Cargando avisos…</p> : !sourceError && !history.length && <p>Todavía no hay avisos de Bre-B.</p>}
    {(before || more) && <nav aria-label="Páginas del historial" className="flex gap-3"><button type="button" disabled={!before || loading} onClick={() => setPrevious(previous.slice(0,-1))}>Anterior</button><button type="button" disabled={!more || loading} onClick={() => setPrevious([...previous, history[history.length-1].id])}>Siguiente</button></nav>}
  </section>;
}
