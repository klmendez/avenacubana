import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { seenHints, useGuideVersion } from "../hooks/useGuideVersion";
import "./ActionHint.css";

const order = ["explorar", "ubicacion", "resenas", "redes", "categorias", "buscar", "presentacion", "agregar", "carrito", "cantidad", "nota", "guardar", "otro", "datos", "sugerencia", "omitir", "servicio", "personal", "localizar", "entrega", "pago", "confirmar", "compartir", "contacto", "mapa", "opinion"] as const;
type Step = typeof order[number];
type Cue = { step: Step; target: HTMLElement; visible: boolean; start: () => void; stop: () => void };
const waiting = new Set<Cue>();
let current: Cue | undefined;
let frame = 0;

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const modal = Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1);
    const eligible = [...waiting].filter(cue => cue.visible && cue.target.isConnected &&
      !cue.target.matches(":disabled") && (!modal || modal.contains(cue.target)));
    if (current && eligible.includes(current)) return;
    current?.stop();
    current = eligible.sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step))[0];
    current?.start();
  });
}

type HintProps = { step: Step; children: string };

export default function ActionHint(props: HintProps) {
  const version = useGuideVersion();
  return <GuideCue key={`${version}-${props.step}`} {...props} />;
}

function GuideCue({ step, children }: HintProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [phase, setPhase] = useState<"idle" | "jump" | "tip">("idle");
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => {
    const target = marker.current?.parentElement;
    if (!target) return;
    if (seenHints.has(step)) return;
    let reveal: number;
    let end: number;
    function clear() { window.clearTimeout(reveal); window.clearTimeout(end); }
    function finish() {
      clear();
      seenHints.add(step);
      setPhase("idle");
      waiting.delete(cue);
      schedule();
    }
    const cue: Cue = { step, target, visible: false,
      start() {
        if (seenHints.has(step)) { finish(); return; }
        const group = target.closest("[data-hint-group]");
        const slots = group?.querySelectorAll("[data-hint-slot]") ?? [];
        setSlot(Array.from(slots).find(el => el.closest("[data-hint-group]") === group) ?? null);
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        setPhase(reduced ? "tip" : "jump");
        if (!reduced) reveal = window.setTimeout(() => setPhase("tip"), 400);
        end = window.setTimeout(finish, reduced ? 1800 : 2200);
      },
      stop() { clear(); setPhase("idle"); }
    };
    const observer = new IntersectionObserver(([entry]) => { cue.visible = entry.intersectionRatio >= .75; schedule(); }, { threshold: [0, .75] });
    waiting.add(cue);
    observer.observe(target);
    target.addEventListener("click", finish, true);
    return () => {
      observer.disconnect(); clear(); waiting.delete(cue);
      if (current === cue) current = undefined;
      target.removeEventListener("click", finish, true);
      schedule();
    };
  }, [step]);

  useEffect(() => {
    const target = marker.current?.parentElement;
    if (phase !== "tip" || !target) return;
    const original = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", [original, id].filter(Boolean).join(" "));
    return () => { if (original) target.setAttribute("aria-describedby", original); else target.removeAttribute("aria-describedby"); };
  }, [phase, id]);

  const tip = phase === "tip" && <span id={id} className="action-hint-tip">{children}</span>;
  return <><span ref={marker} className="action-hint" data-phase={phase} aria-hidden="true" />{slot && createPortal(tip, slot)}</>;
}
