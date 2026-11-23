import { Search } from "lucide-react";
import "./Catalogo.css";
import ActionHint from "../components/ActionHint";
import { useEffect, useRef, useState } from "react";
import { cop } from "../lib/format";
import { familyImage, fold, groupCatalog, price, type Family } from "../lib/catalogFamilies";
import { type Product } from "../data/products";
import { useOrderItems } from "../hooks/useOrderItems";
import { useStoreProducts } from "../hooks/useStoreProducts";

type Props = { embedded?: boolean; showHeader?: boolean; productType?: "carta" | "otro" | "todos" };
const tabs = ["Todos", "Avenas", "Sevillanas", "Kumis", "Yogures", "Especialidades", "Acompañantes"];
function ProductRow({family,add,guided}: {family:Family; guided:boolean; add:(product:Product,qty:number)=>void}) {
  const [id,setId] = useState("");
  const options = family.options;
  const current = options.find(o=>o.product.id===id) || options.find(o=>o.product.disponible && price(o.product)>0) || options[0];
  const item = current.product;
  const unit = price(item);
  const image = familyImage(family, item);
  return <article data-hint-group className="menu-row">
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
          {guided && current.product.id === product.id && <ActionHint step="presentacion">Elige el tamaño que prefieras.</ActionHint>}
        </label>
      ))}
    </fieldset>
    {item.disponible && unit>0 && <div className="menu-order">
      <strong>{cop(unit)}</strong>
      <button type="button" className="menu-add" aria-label={`Agregar ${item.name}`} onClick={()=>add({...item, image},1)}>Agregar <span aria-hidden="true">＋</span>{guided && <ActionHint step="agregar">Toca aquí para agregar esta presentación.</ActionHint>}</button>
    </div>}
    <div data-hint-slot className="col-span-full" />
  </article>;
}

export default function Catalogo({ embedded=false,showHeader=true,productType="carta" }:Props) {
  const menuRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [tab,setTab]=useState("Todos");
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState("");
  const {products,loading,error,reload}=useStoreProducts();
  const {addProduct,items}=useOrderItems();
  const families = groupCatalog(products).filter(family => productType === "todos" ||
    (productType === "otro") === (family.category === "Acompañantes"));
  const visible=families.filter(f=>fold([f.name,f.category,...f.options.map(o=>o.product.name)].join(" ")).includes(fold(query)));
  const availableTabs = tabs.filter(t => t === "Todos" || visible.some(f => f.category === t));

  const guidedFamily = !items.length && (tab === "Todos" ? availableTabs.slice(1) : [tab])
    .map(category => visible.find(f => f.category === category && f.options.some(o => o.product.disponible && price(o.product) > 0)))
    .find(Boolean);

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

  function addToOrder(product: Product, qty: number) {
    addProduct(product, qty);
    setNotice(`${qty} × ${product.name} agregado al pedido`);

  }

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
  return <main data-hint-group ref={menuRef} className={'store-menu mx-auto max-w-4xl px-4 pb-24 '+(embedded?'':'pt-20')}>
    {showHeader && <header className="py-3 text-center"><h1 className="text-3xl text-rojo-dark">Nuestra carta</h1><p className="text-sm">Descubre los sabores de Avena Cubana Pop.</p></header>}
    <div data-hint-slot />
    <nav ref={navRef} aria-label="Categorías" className="menu-tabs">{availableTabs.map(t=><button key={t} aria-pressed={tab===t}  onClick={()=>goToCategory(t)}>{t === "Todos" ? "Toda la carta" : t}{t === "Todos" && !items.length && <ActionHint step="categorias">Explora la carta por categoría.</ActionHint>}</button>)}</nav>
    <label className="mb-3 flex items-center gap-2 rounded-full border border-sky-200 px-4"><Search size={16} aria-hidden="true"/><input className="min-h-11 min-w-0 flex-1 bg-transparent" aria-label="Buscar productos" placeholder="¿Qué te provoca hoy?" value={query} onChange={e=>setQuery(e.target.value)}/>{!items.length && <ActionHint step="buscar">Busca por nombre o sabor.</ActionHint>}</label>
    {tabs.slice(1).map(t=>{const group=visible.filter(f=>f.category===t);return group.length>0 && <section key={t} data-menu-category={t}><h2 className="menu-section-title">{t}</h2><div className="menu-rows">{group.map(f=><ProductRow key={f.name} family={f} guided={f === guidedFamily} add={addToOrder}/>)}</div></section>})}
    <p role="status" className="my-3 text-sm">{loading?"Cargando productos…":error || (!visible.length?"No hay productos para esta selección.":notice)}</p>
    {error && <button onClick={()=>void reload()}>Reintentar</button>}
  </main>;
}
