import { catalogProductImage } from "../../lib/catalogFamilies";
import { useState } from "react";
import { Archive, Copy, Edit3, Package, Plus, Search } from "lucide-react";
import { cop } from "../../lib/format";
import type { CatalogItem } from "./CatalogAdmin";

type Props = {
  items: CatalogItem[];
  create: () => void;
  edit: (item: CatalogItem) => void;
  duplicate: (item: CatalogItem) => void;
  archive: (id: string) => void;
};
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function parts(name: string) {
  const match = name.trim().match(/^(.+?)\s+((?:vaso\s+)?\d+\s*(?:oz|lt|litros?|unidad)|galón|paquete x\s*\d+|por unidad|und)$/i);
  return { name: match?.[1] || name, size: match?.[2] || "Por definir" };
}
function Badge({yes}: {yes: boolean}) {
  return <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (yes ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600')}>{yes ? '● Sí' : '● No'}</span>;
}
export default function ProductList({items, create, edit, duplicate, archive}: Props) {
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('');
  const [visibility,setVisibility] = useState('');
  const [detail,setDetail] = useState('');
  const [page,setPage] = useState(1);
  const categories = [...new Set(items.map(i=>i.category))].sort();
  const filtered = items.filter(item =>
    (!category || item.category === category)
    && (!visibility || item.available === (visibility === 'visible'))
    && fold(item.name + ' ' + item.category).includes(fold(search.trim()))
  ).sort((a,b) => a.name.localeCompare(b.name,'es',{numeric:true}));
  const pages = Math.max(1,Math.ceil(filtered.length/10));
  const current = Math.min(page,pages);
  const selected = items.find(item => item.id === detail);
  const actions = (item:CatalogItem) => <div className="flex gap-1 text-sky-700">{[
    {label:'Editar',icon:Edit3,run:()=>edit(item)}, {label:'Duplicar',icon:Copy,run:()=>duplicate(item)},
    {label:'Retirar',icon:Archive,run:()=>archive(item.id)}
  ].map(({label,icon:Icon,run})=><button key={label} title={label+' '+item.name} aria-label={label+' '+item.name} onClick={run} className="rounded-lg p-2 hover:bg-sky-100"><Icon size={17}/></button>)}</div>;
  const photo = (i:CatalogItem,large=false) => {
    const image = catalogProductImage(i.name, i.image_url);
    return image ? <img alt="" src={image} className={large?'mx-auto size-48 max-w-full object-contain':'h-11 w-11 object-contain'}/> : <Package aria-hidden="true" className={large?'mx-auto h-32 w-32 text-sky-200':'h-10 w-10 p-2 text-sky-500'}/>;
  };
  if(selected) {
    const first=selected;
    return <section><button onClick={()=>setDetail('')} className="text-sky-700">‹ Productos</button><h2 className="my-3 text-3xl font-bold">{first.name}</h2>
      <div className="grid items-center gap-5 border-y border-sky-200 py-4 sm:grid-cols-[220px_1fr]">{photo(first,true)}<div><b>{first.category}</b><p>{first.description}</p><p className="mt-3">Precio desde {cop(first.price)}</p></div></div>
      <h3 className="my-4 text-xl font-bold">Presentaciones y precios</h3><div className="admin-data-table" tabIndex={0} role="region" aria-label="Presentaciones y precios"><table><thead><tr>{['Presentación','Precio','Visible','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{[selected].map(i=><tr key={i.id}><td>{parts(i.name).size}</td><td>{cop(i.price)}</td><td><Badge yes={i.available}/></td><td>{actions(i)}</td></tr>)}</tbody></table></div></section>;
  }
  return <><div className="flex flex-wrap items-center gap-3"><button onClick={create} className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2.5 font-semibold text-white"><Plus size={18}/>Nuevo producto</button><label className="flex min-w-48 flex-1 items-center gap-2 rounded-full border border-sky-200 bg-white px-4"><Search size={17}/><input aria-label="Buscar producto" placeholder="Buscar producto…" className="w-full py-2.5" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></label><select aria-label="Visibilidad" className="rounded-full border border-sky-200 px-4 py-2.5" value={visibility} onChange={e=>{setVisibility(e.target.value);setPage(1)}}><option value="">Visibilidad: Todas</option><option value="visible">Visible en carta</option><option value="oculto">Oculto</option></select></div>
    <nav aria-label="Categorías de productos" className="my-3 flex gap-2 overflow-x-auto">{['',...categories].map(c=><button key={c} aria-pressed={category===c} onClick={()=>{setCategory(c);setPage(1)}} className={'shrink-0 border-b-2 px-4 py-2 '+(category===c?'border-sky-600 font-bold text-sky-700':'border-transparent')}>{c||'Todas'}</button>)}</nav>
    <div className="admin-data-table" tabIndex={0} role="region" aria-label="Productos"><table><thead><tr>{['Producto','Categoría','Presentación','Precio','Visible en carta','Acciones'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.slice((current-1)*10,current*10).map(item=><tr key={item.id}><td><button className="flex items-center gap-3 text-left font-semibold" onClick={()=>setDetail(item.id)}>{photo(item)}{item.name}</button></td><td>{item.category}</td><td>{parts(item.name).size}</td><td>{cop(item.price)}</td><td><Badge yes={item.available}/></td><td>{actions(item)}</td></tr>)}</tbody></table></div>
    {!filtered.length&&<p className="py-6">No se encontraron productos.</p>}<footer className="mt-4 flex items-center justify-between"><span>{filtered.length} productos</span><div className="flex items-center gap-3"><button disabled={current===1} onClick={()=>setPage(current-1)}>Anterior</button>{current} / {pages}<button disabled={current===pages} onClick={()=>setPage(current+1)}>Siguiente</button></div></footer></>;
}