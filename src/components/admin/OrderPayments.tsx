import { Check, ReceiptText } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { paymentSummary } from '../../lib/orderStatus';
import { cop } from '../../lib/format';
import { completeSubmission, submissionIdentity } from '../../lib/submission';
import SaleTicket, { type Ticket } from './SaleTicket';
import type { PedidoFirestore } from '../../types/order';

type Payment = { id: string; amount: number; method: string; created_at: string; note: string };
export default function OrderPayments({ order, onChanged, canRefund = true }: { canRefund?: boolean; order: PedidoFirestore & { id: string }; onChanged: () => void }) {
  const { id: orderId, total } = order;
  const cancelled = order.estado === 'cancelado';
  const [ticket, setTicket] = useState<Ticket | null>(null);
  function printCollection(payment: Payment) {
    setTicket({
      number: order.numeroOrden,
      customer: order.cliente.nombres || 'Consumidor final',
      date: new Date(payment.created_at),
      payment: payment.method,
      paid: true,
      quote: { items: order.items, delivery: order.delivery, total, descuentoTotal: order.descuentoTotal ?? 0 },
      collection: {
        id: payment.id,
        amount: payment.amount,
        cashDetail: payment.note?.startsWith('Recibido:') ? payment.note : undefined,
      },
    });
  }
  const [payments, setPayments] = useState<Payment[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Efectivo');
  const [refund, setRefund] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const { collected: paid, balance } = paymentSummary(order);
  useEffect(() => {
    let active = true;
    setReady(false);
    void supabase!.from('order_payments').select('*').eq('order_id', orderId).order('created_at').then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(error.message);
      else {
        setPayments(data);
        setReady(true);
      }
    });
    return () => { active = false; };
  }, [orderId, paid, revision]);
  const synchronized = ready && paid === payments.reduce((sum, payment) => sum + payment.amount, 0);
  const tendered = Number(amount);
  const cash = !refund && method === 'Efectivo';
  const applied = cash ? Math.min(tendered, balance) : tendered;
  const change = cash ? tendered - applied : 0;
  const limit = refund ? paid : balance;
  const unavailable = !synchronized || limit <= 0 || (!refund && cancelled);
  const excessive = !cash && tendered > limit;
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(unavailable || excessive || !Number.isSafeInteger(tendered) || tendered <= 0 || lock.current || !supabase) return; lock.current=true; setSaving(true); setMessage('');
    const data={p_order_id:orderId,p_amount:applied*(refund?-1:1),p_method:method};
    const identity=submissionIdentity('payment',data);
    const note = cash ? `Recibido: ${cop(tendered)} · Cambio: ${cop(change)}`
      : refund ? 'Devolución registrada en caja' : 'Cobro registrado en caja';
    try {
      const { data: paymentId, error } = await supabase.rpc('record_order_payment', {
        ...data, p_request_id: identity.requestId, p_note: note,
      });
      if (error) throw error;
      completeSubmission('payment');
      setAmount('');
      if (!refund) {
        printCollection({ id: paymentId, amount: applied, method, note, created_at: new Date().toISOString() });
      }
      setReady(false);
      setRevision(n => n + 1);
      onChanged();
      setMessage(refund ? 'Devolución guardada.' : applied === balance
        ? `Pago completo guardado.${change ? ' Cambio: ' + cop(change) + '.' : ''}`
        : 'Abono guardado. Aún queda saldo pendiente.');
    }
    catch(error) { setMessage(error instanceof Error?error.message:String((error as {message?: string}).message || 'No se pudo guardar')); }
    finally {lock.current=false;setSaving(false);}
  }

  return (
    <section id="cobros-pedido" className="order-collections" aria-labelledby="collection-title">
      {ticket && <SaleTicket ticket={ticket} />}
      <h3 id="collection-title"><ReceiptText aria-hidden="true" />{canRefund ? 'Cobros y devoluciones' : 'Cobros del pedido'}</h3>
      <dl className="collection-totals">
        <div><dt>Cobrado</dt><dd>{ready ? cop(paid) : '—'}</dd></div>
        <div><dt>Saldo pendiente</dt><dd>{ready ? cop(balance) : '—'}</dd></div>
      </dl>
      {ready && !refund && balance === 0 && <p className="collection-settled">Pedido pagado por completo.</p>}
      {(canRefund || !ready || balance > 0) && (
        <form className="collection-form" onSubmit={register}>
          {canRefund && <fieldset>
            <legend>Operación</legend>
            <div className="collection-options">
              {['Cobro', 'Devolución'].map(operation => (
                <label key={operation}>
                  <input type="radio" name="operation" checked={refund === (operation === 'Devolución')}
                    onChange={() => { setRefund(operation === 'Devolución'); setMessage(''); setAmount(''); }} />
                  {operation}
                </label>
              ))}
            </div>
          </fieldset>}
          <fieldset>
            <legend>Método de pago</legend>
            <div className="collection-options">
              {['Efectivo', 'Transferencia'].map(value => (
                <label key={value}>
                  <input type="radio" name="collection-method" checked={method === value}
                    onChange={() => { setMethod(value); setMessage(''); }} />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="collection-amount">
            <label htmlFor="collection-amount">{cash ? 'Efectivo recibido' : refund ? 'Importe a devolver' : 'Importe a cobrar'}</label>
            <input id="collection-amount" required min="1" step="1" type="number" inputMode="numeric"
              value={amount} onChange={e => { setAmount(e.target.value); setMessage(''); }} />
            {ready && !cancelled && balance > 0 && !refund && <button className="collection-fill" type="button"
              onClick={() => { setMessage(''); setAmount(String(balance)); }}>Usar saldo completo ({cop(balance)})</button>}
          </div>
          {ready && cash && !unavailable && change > 0 && <p aria-live="polite">Cobro al pedido: {cop(applied)} · Cambio: {cop(change)}</p>}
          {ready && excessive && <p role="alert">{refund ? 'La devolución supera el dinero cobrado' : 'La transferencia supera el saldo pendiente'} ({cop(limit)}).</p>}
          <button className="collection-submit" disabled={saving || unavailable || excessive || !Number.isSafeInteger(tendered) || tendered <= 0}>
            <Check size={19} aria-hidden="true" />{saving ? 'Guardando…' : refund ? 'Registrar devolución' : 'Registrar cobro'}
          </button>
        </form>
      )}
      {ready && !synchronized && <p role="status">Actualizando el saldo del pedido… <button type="button" onClick={() => { setRevision(n => n + 1); onChanged(); }}>Actualizar</button></p>}
      <p role="status">{message}</p>
      {payments.length > 0 && <div className="collection-history">
        <h4>Movimientos registrados</h4>
        <ul>{payments.map(payment => <li key={payment.id}>
          <span>{payment.method}<small>{new Date(payment.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</small></span>
          <strong>{cop(payment.amount)}</strong>
          {payment.amount > 0 && <button type="button" onClick={() => printCollection(payment)}>Reimprimir</button>}
        </li>)}</ul>
      </div>}
    </section>
  );
}
