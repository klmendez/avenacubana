import type { OrderItem } from "../../lib/whatsapp";
import { cop } from "../../lib/format";
import { getBasePrice } from "../../lib/pricing";
import ProductImage from "../ProductImage";
import ActionHint from "../ActionHint";
import { Minus, Plus } from "lucide-react";

type Props = {
  items: OrderItem[];
  updateItem: (itemId: string, patch: Partial<OrderItem>) => void;
  duplicateItem: (itemId: string) => void;
  removeItem: (itemId: string) => void;
  activeProductId?: string | null;
  onFocusProduct?: (itemId: string | null) => void;
  waitingForSuggestions: boolean;
  onGoToNext?: () => void;
  onAddAnotherProduct?: () => void;
  showIncompleteWarning?: boolean;
  disabledToppingIds?: string[];
};

export default function ProductConfigSection({
  items,
  removeItem,
  updateItem,
  activeProductId,
  onFocusProduct,
  waitingForSuggestions,
  onGoToNext,
  onAddAnotherProduct,
}: Props) {
  if (!items.length) return null;

  return <section>
    <div className="hidden border-b border-sky-100 pb-3 sm:block">
      <h2 className="hidden text-center text-lg font-semibold text-stone-900 sm:block">Revisa tu pedido</h2>
    </div>

    <div className="divide-y divide-stone-200">
      {items.map((item, index) => {
        const active = activeProductId === item.id;
        const price = getBasePrice(item.product, null, item.size);
        return <article data-hint-group key={item.id} className="py-4">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-4">
            <div className="aspect-square overflow-hidden bg-crema-dark"><ProductImage src={item.product.image ?? "/avena-cubana-logo.png"} alt={item.product.name} className="h-full w-full object-cover" /></div>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold leading-tight text-stone-900">{item.product.name}</h3><p className="mt-1 text-sm font-semibold text-rojo">{cop(price)}</p></div><button type="button" onClick={() => removeItem(item.id)} aria-label={`Quitar ${item.product.name} del pedido`} className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100">Quitar</button></div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center rounded-full border border-stone-200"><button type="button" aria-label={`Quitar una unidad de ${item.product.name}`} onClick={() => item.qty > 1 ? updateItem(item.id, { qty: item.qty - 1 }) : removeItem(item.id)} className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sky-900 hover:bg-sky-200"><Minus size={16} aria-hidden="true" /></button><span className="min-w-6 text-center text-sm font-medium tabular-nums">{item.qty}</span><button type="button" aria-label={`Agregar una unidad de ${item.product.name}`} onClick={() => updateItem(item.id, { qty: item.qty + 1 })} className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sky-900 hover:bg-sky-200"><Plus size={16} aria-hidden="true" />{index === 0 && <ActionHint step="cantidad">Ajusta las unidades con + y −.</ActionHint>}</button></div>
                <button type="button" onClick={() => onFocusProduct?.(active ? null : item.id)} aria-expanded={active} className="rounded-full bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-200">{active ? "Cerrar nota" : item.note?.trim() ? "Editar nota" : "Agregar nota"}{index === 0 && !active && <ActionHint step="nota">¿Una petición especial? Déjala aquí.</ActionHint>}</button>
              </div>
            </div>
          </div>

          <div data-hint-slot />
          {active && <div className="mt-4 sm:ml-[6.5rem]">
            <label htmlFor={`note-${item.id}`} className="text-sm font-semibold text-stone-900">Nota para este producto <span className="font-normal text-stone-400">(opcional)</span></label>
            <textarea id={`note-${item.id}`} value={item.note ?? ""} onChange={(event) => updateItem(item.id, { note: event.target.value })} maxLength={180} rows={2} placeholder={/acompan|acompañ|antojo/i.test(item.product.categoryId ?? "") ? "Ej. Empacar por separado." : "Ej. Sin pitillo, por favor."} className="mt-2 w-full resize-none rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-rojo" />
            <button type="button" onClick={() => onFocusProduct?.(null)} className="mt-3 rounded-full bg-rojo px-5 py-2 text-xs font-semibold text-crema">Guardar nota<ActionHint step="guardar">Guarda esta indicación.</ActionHint></button>
          </div>}

          {!active && item.note?.trim() && <p className="ml-[5.25rem] mt-3 border-l-2 border-rojo pl-3 text-xs text-stone-600 sm:ml-[6.5rem]">{item.note.trim()}</p>}
        </article>;
      })}
    </div>

    <div data-hint-group className="mt-5 flex flex-wrap flex-col gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onAddAnotherProduct} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-sky-100 px-5 text-sm font-semibold text-sky-900 hover:bg-sky-200"><Plus size={16} aria-hidden="true" /> Agregar otro producto<ActionHint step="otro">Vuelve a la carta para sumar algo más.</ActionHint></button>
      <button type="button" disabled={waitingForSuggestions} onClick={onGoToNext} className="hidden min-h-11 items-center gap-2 rounded-full bg-rojo px-5 text-sm font-medium text-crema transition-colors hover:bg-rojo-dark sm:flex">{waitingForSuggestions ? "Cargando sugerencias…" : "Continuar con mis datos"} <span aria-hidden="true">→</span>{!waitingForSuggestions && !activeProductId && <ActionHint step="datos">¿Todo listo? Sigue aquí.</ActionHint>}</button>
      <div data-hint-slot className="basis-full" />
    </div>
  </section>;
}
