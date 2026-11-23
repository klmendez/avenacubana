import { Search } from "lucide-react";
import "./Catalogo.css";
import { useEffect, useRef, useState } from "react";
import { cop } from "../lib/format";
import { isFixedPrice, type Product } from "../data/products";
import { useOrderItems } from "../hooks/useOrderItems";
import { useStoreProducts } from "../hooks/useStoreProducts";

type Props = { embedded?: boolean; showHeader?: boolean; productType?: "carta" | "otro" | "todos" };
const tabs = ["Todos", "Avenas", "Sevillanas", "Kumis", "Yogures", "Especialidades", "Acompañantes"];
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const price = (p: Product) => p.category === "frutafresh" && isFixedPrice(p.prices) ? p.prices.fijo : 0;
type Option = { label: string; rank: number; product: Product };
type Family = { name: string; category: string; options: Option[] };

function describe(product: Product) {
  const raw = product.name.trim();
  const suffix = /\s+((?:vaso\s*)?(\d+)\s*(oz|lt|litros?)|vaso|gal[oó]n|por unidad|1 unidad|und|paquete\s+x\s*\d+)$/i.exec(raw);
  const base = suffix ? raw.slice(0,suffix.index) : raw;
  const key = fold(base);
  let name = base;
  let category = "Especialidades";
  if (/^(avena|avena cubana)$/.test(key)) { name = "Avena Cubana"; category = "Avenas"; }
  else if (/^(super )?sevillana$/.test(key)) { name = "Súper Sevillana"; category = "Sevillanas"; }
  else if (/^kumis( tradicional)?$/.test(key)) { name = "Kumis tradicional"; category = "Kumis"; }
  else if (/^yogur(t)?\b/.test(key)) { category = "Yogures"; name = base.replace(/^yogurt?\s+(de\s+)?/i,"Yogurt "); }
  else if (/acompan|antojo/.test(fold(product.categoryId || ""))) category = "Acompañantes";
  const amount = Number(suffix?.[2]);
  const oz = suffix?.[3]?.toLowerCase() === "oz";
  const label = amount ? (oz ? `Vaso ${amount} oz` : `${amount} ${amount===1?"litro":"litros"}`) : suffix?.[1] || "Presentación por confirmar";
  const rank = amount ? amount * (oz ? 30 : 1000) : 4000;
  return {name, category, option:{label,rank,product}};
}

function ProductRow({family,add}: {family:Family; add:(product:Product,qty:number)=>void}) {
  const [id,setId] = useState("");
  const options = family.options;
  const current = options.find(o=>o.product.id===id) || options.find(o=>o.product.disponible && price(o.product)>0) || options[0];
  const item = current.product;
  const unit = price(item);
  const image = item.image || options.find(o=>o.product.image)?.product.image || "/avena-cubana-logo.png";
  return <article className="menu-row">
    <header className="menu-heading">
      <img src={image} alt="" loading="lazy"/>
      <div><h3>{family.name}</h3><p>{item.description || (family.category === "Avenas" ? "Cremosa y refrescante." : "")}</p></div>
    </header>
    <fieldset className="menu-sizes"><legend>Presentación</legend>
      {options.map(({label,product}) => (
        <label key={product.id} className="menu-size">
          <input type="radio" name={options[0].product.id} checked={current.product.id === product.id} disabled={!product.disponible || price(product)<=0} onChange={()=>setId(product.id)}/>
          <span>{label}</span>
          <span className="menu-price">{price(product)>0 ? cop(price(product)) : "Por confirmar"}
            {price(product)>0 && !product.disponible && <small>Agotado</small>}
          </span>
        </label>
      ))}
    </fieldset>
    {item.disponible && unit>0 && <div className="menu-order">
      <strong>{cop(unit)}</strong>
      <button type="button" className="menu-add" aria-label={`Agregar ${item.name}`} onClick={()=>add(item,1)}>Agregar <span aria-hidden="true">＋</span></button>
    </div>}
  </article>;
}

export default function Catalogo({ embedded=false,showHeader=true,productType="carta" }:Props) {
  const menuRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [tab,setTab]=useState("Todos");
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState("");
  const {products,loading,error,reload}=useStoreProducts();
  const {addProduct}=useOrderItems();
  const families=new Map<string,Family>();
  for(const item of products){
    const {name,category,option}=describe(item);
    if(productType==="otro" && category!=="Acompañantes" || productType==="carta" && category==="Acompañantes") continue;
    const key=category+"·"+fold(name);
    const family=families.get(key) || {name,category,options:[]};
    family.options.push(option);families.set(key,family);
  }
  const visible=[...families.values()].filter(f=>fold([f.name,f.category,...f.options.map(o=>o.product.name)].join(" ")).includes(fold(query)));
  for(const family of visible) family.options.sort((a,b)=>a.rank-b.rank);
  const availableTabs = tabs.filter(t => t === "Todos" || visible.some(f => f.category === t));

  useEffect(() => {
    const menu = menuRef.current;
    const nav = navRef.current;
    if (!menu || !nav) return;
    let frame = 0;
    function syncSection() {
      const sections = Array.from(menu!.querySelectorAll<HTMLElement>("[data-menu-category]"));
      const line = nav!.getBoundingClientRect().bottom + 10;
      const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const active = atEnd ? sections.at(-1) : sections.filter(s => s.getBoundingClientRect().top <= line).at(-1);
      setTab(active?.dataset.menuCategory || "Todos");
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncSection);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(menu);
    schedule();
    window.addEventListener("scroll", schedule, {passive:true});
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [query, products]);

  useEffect(() => {
    const nav = navRef.current;
    const button = nav?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!nav || !button) return;
    const area = nav.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    if (rect.left < area.left || rect.right > area.right)
      nav.scrollLeft += rect.left - area.left - (area.width - rect.width) / 2;
  }, [tab]);

  function goToCategory(category: string) {
    const menu = menuRef.current;
    const nav = navRef.current;
    if (!menu || !nav) return;
    const section = Array.from(menu.querySelectorAll<HTMLElement>("[data-menu-category]"))
      .find(s => s.dataset.menuCategory === category);
    const headerHeight = parseFloat(getComputedStyle(nav).top) || 0;
    const top = category === "Todos" ? menu.getBoundingClientRect().top - headerHeight
      : (section?.getBoundingClientRect().top ?? 0) - headerHeight - nav.offsetHeight - 4;
    window.scrollTo({top:window.scrollY + top, behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
  }
  return <main ref={menuRef} className={'store-menu mx-auto max-w-4xl px-4 pb-24 '+(embedded?'':'pt-20')}>
    {showHeader && <header className="py-3 text-center"><h1 className="text-3xl text-rojo-dark">Nuestra carta</h1><p className="text-sm">Descubre los sabores de Avena Cubana Pop.</p></header>}
    <nav ref={navRef} aria-label="Categorías" className="menu-tabs">{availableTabs.map(t=><button key={t} aria-pressed={tab===t}  onClick={()=>goToCategory(t)}>{t === "Todos" ? "Toda la carta" : t}</button>)}</nav>
    <label className="mb-3 flex items-center gap-2 rounded-full border border-sky-200 px-4"><Search size={16} aria-hidden="true"/><input className="min-h-11 min-w-0 flex-1 bg-transparent" aria-label="Buscar productos" placeholder="¿Qué te provoca hoy?" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {tabs.slice(1).map(t=>{const group=visible.filter(f=>f.category===t);return group.length>0 && <section key={t} data-menu-category={t}><h2 className="menu-section-title">{t}</h2><div className="menu-rows">{group.map(f=><ProductRow key={f.name} family={f} add={(p,qty)=>{addProduct(p,qty);setNotice(`${qty} × ${p.name} agregado al pedido`)}}/>)}</div></section>})}
    <p role="status" className="my-3 text-sm">{loading?"Cargando productos…":error || (!visible.length?"No hay productos para esta selección.":notice)}</p>
    {error && <button onClick={()=>void reload()}>Reintentar</button>}
  </main>;
}
