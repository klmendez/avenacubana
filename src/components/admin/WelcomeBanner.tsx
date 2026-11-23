import './CashierHome.css';

export default function WelcomeBanner({ description = 'Selecciona una opción para comenzar tu jornada.' }: { description?: string }) {
  return <section className="cash-welcome">
    <div><h2>¡Hola! ¿Qué vamos a hacer hoy?</h2><p>{description}</p></div>
    <img src="/inicio/vaso-avena-cubana-pop-transparente.png" alt="" />
  </section>;
}
