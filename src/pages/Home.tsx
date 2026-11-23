import { Link } from "react-router-dom";
import { BUSINESS_ADDRESS, BUSINESS_MAP_URL, INSTAGRAM_URL, waLink } from "../data/constants";
import "./Home.css";

export default function Home() {
  return (
    <main className="public-home">
      <div className="home-landing">
        <div className="home-intro">
          <div className="home-product-photo">
            <img src="/inicio/vaso-portada.webp" alt="Vaso de Avena Cubana Pop con canela" width="900" height="675" fetchPriority="high" />
          </div>
          <div className="home-intro-copy">
            <h1>Tradición, sabor y frescura <span>en cada vaso.</span></h1>
          </div>
        </div>
        <nav aria-label="Explora Avena Cubana Pop" className="home-links">
          <Link to="/productos"><img src="/inicio/productos.png" alt="" />Productos</Link>
          <Link to="/contacto"><img src="/inicio/ubicacion.png" alt="" />Ubicación</Link>
          <Link to="/resenas"><img src="/inicio/resenas.png" alt="" />Reseñas</Link>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><img src="/inicio/redes.png" alt="" />Redes</a>
        </nav>
        <div className="home-contact">
          <a href={BUSINESS_MAP_URL} target="_blank" rel="noreferrer">{BUSINESS_ADDRESS}</a>
          <a href={waLink("Hola, quiero conocer los productos de Avena Cubana Pop")} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>
    </main>
  );
}
