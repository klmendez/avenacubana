import { useState } from "react";
import type { Product } from "../../data/products";
import { catalogProductImage, price, type Family, type OfferKind } from "../../lib/catalogFamilies";
import { cop } from "../../lib/format";
import ActionHint from "../ActionHint";

function OfferRow({ family, first, onAdd }: { family: Family; first: boolean; onAdd: (p: Product) => void }) {
  const [selected, setSelected] = useState("");
  const option = family.options.find(o => o.product.id === selected) ?? family.options.reduce((best, next) =>
    price(next.product) < price(best.product) ? next : best);
  const product = option.product;
  const image = catalogProductImage(product.name, product.image) ?? "/avena-cubana-logo.png";
  return <li className="grid grid-cols-[clamp(4.5rem,20vw,6rem)_minmax(0,1fr)_auto] items-center gap-2 py-3">
    <img src={image} alt={`${family.name}, ${option.label}`} loading="lazy" className="aspect-square w-full object-contain" />
    <div className="min-w-0">
      <strong className="block text-sm">{family.name}</strong>
      {family.options.length > 1 ? <select aria-label={`Presentación de ${family.name}`} value={product.id}
        onChange={event => setSelected(event.target.value)} className="my-1 max-w-full rounded-lg border border-sky-200 bg-white px-1">
        {family.options.map(o => <option value={o.product.id} key={o.product.id}>{o.label}</option>)}
      </select> : <small className="block">{option.label}</small>}
      <span className="block text-xs text-slate-600">{cop(price(product))}</span>
    </div>
    <button type="button" aria-label={`Agregar ${product.name}`} onClick={() => onAdd(product)}
      className="rounded-full bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-900">
      Agregar {first && <ActionHint step="sugerencia">Suma un extra si te apetece.</ActionHint>}
    </button>
  </li>;
}

export default function ComplementOffer({ kind, families, onAdd, onBack, onContinue }: {
  kind: OfferKind; families: Family[]; onAdd: (product: Product) => void; onBack: () => void; onContinue: () => void;
}) {
  const [lastAdded, setLastAdded] = useState("");
  const drink = kind === "bebida";
  return <section data-hint-group className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl bg-crema p-4 shadow-xl sm:p-6">
    <h2 id="offer-title" className="text-xl font-semibold text-rojo-dark">{drink ? "¿Quieres llevar una bebida?" : "¿Con qué acompañas tu bebida?"}</h2>
    <div data-hint-slot />
    <ul className="mt-3 min-h-0 flex-1 divide-y divide-sky-100 overflow-y-auto border-y border-sky-100">
      {families.map((f, i) => <OfferRow key={f.name} family={f} first={i === 0}
        onAdd={p => { onAdd(p); setLastAdded(p.name); }} />)}
    </ul>
    <p role="status" className="text-sm text-sky-900">{lastAdded && `Agregaste ${lastAdded}.`}</p>
    <button type="button" onClick={onContinue} className="mt-3 min-h-11 rounded-full bg-rojo px-4 text-sm font-semibold text-white">
      {lastAdded ? "Continuar con mis datos" : drink ? "Continuar sin bebida" : "Continuar sin acompañante"}
      <ActionHint step="omitir">Sigue cuando estés listo.</ActionHint>
    </button>
    <button type="button" onClick={onBack} className="mt-2 min-h-10 bg-sky-100 text-sm font-semibold text-sky-900">Volver al pedido</button>
  </section>;
}
