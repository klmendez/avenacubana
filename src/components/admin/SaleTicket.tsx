import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BUSINESS_ADDRESS, WHATSAPP_PHONE, paymentMethodLabel } from '../../data/constants';
import { cop } from '../../lib/format';
import { getBasePrice } from '../../lib/pricing';
import type { Quote } from '../../hooks/useServerQuote';
import './SaleTicket.css';

export type Ticket = {
  number: string; customer: string; date: Date; payment: string; paid: boolean; quote: Pick<Quote, 'items' | 'delivery' | 'descuentoTotal' | 'total'>;
  collection?: { id: string; amount: number; cashDetail?: string };
};

export default function SaleTicket({ ticket }: { ticket: Ticket }) {
  const logo = useRef<HTMLImageElement>(null);
  useEffect(() => {
    let active = true;
    const openPrint = async () => {
      await logo.current?.decode().catch(() => {});
      if (active) window.print();
    };
    void openPrint();
    return () => { active = false; };
  }, [ticket]);

  const { quote } = ticket;
  return createPortal(<article className="sale-ticket">
    <header className="ticket-brand"><img ref={logo} src="/avena-ticket-mono.png" alt="Avena Cubana Pop" />
    <strong>Avena Cubana Pop</strong><div>NIT 1059234136-3</div></header>
    {ticket.collection && <strong>Comprobante de cobro</strong>}
    <p>Venta: {ticket.number}<br/>Cliente: {ticket.customer}<br/>
      Fecha: {ticket.date.toLocaleString('es-CO', {timeZone:'America/Bogota'})}<br/>
      Punto de venta: PDV-1
      {ticket.collection && <><br/>Ref. de cobro: {ticket.collection.id}</>}</p>
    <strong>Detalle de venta</strong>
    <table><thead><tr><th>Producto</th><th>Precio</th><th>Cant.</th><th>Subtotal</th></tr></thead>
      <tbody>{quote.items.map(line => {
        const price = getBasePrice(line.product, line.version, line.size);
        return <tr key={line.id}><td>{line.product.name}</td><td>{cop(price)}</td><td>{line.qty}</td><td>{cop(price * line.qty)}</td></tr>;
      })}</tbody></table>
    {quote.descuentoTotal > 0 && <div>Descuento: −{cop(quote.descuentoTotal)}</div>}
    {quote.delivery > 0 && <div>Domicilio: {cop(quote.delivery)}</div>}
    <p className="ticket-total"><strong>Total: {cop(quote.total)}</strong><br/>{ticket.collection
      ? <>Cobro registrado: {cop(ticket.collection.amount)} · {paymentMethodLabel(ticket.payment)}
          {ticket.collection.cashDetail && <><br/>{ticket.collection.cashDetail}</>}</>
      : <>{ticket.paid ? 'Cobrado' : 'Pendiente de pago'} · {paymentMethodLabel(ticket.payment)}</>}</p>
    <footer>{BUSINESS_ADDRESS}<br/>{WHATSAPP_PHONE}<br/><strong>¡Gracias por tu compra!</strong></footer>
  </article>, document.body);
}
