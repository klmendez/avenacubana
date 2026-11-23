const message = "Venimos desde el sitio web de Avena Cubana Pop y nos interesa un menú web como ese";
const akoraUrl = `https://api.whatsapp.com/send?phone=573148320587&text=${encodeURIComponent(message)}`;

export default function Footer() {
  return <footer className="site-footer">
    <a href={akoraUrl} target="_blank" rel="noreferrer">Desarrollado por Akora</a>
  </footer>;
}
