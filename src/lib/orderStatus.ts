import type { OrderStatus, PedidoFirestore } from '../types/order';

export const fulfillmentLabels = {
  registrado: 'Registrado',
  preparando: 'En preparación',
  en_camino: 'En ruta',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
} as const;

export function fulfillmentStatus(status: OrderStatus) {
  return status === 'pagado' || status === 'no_pagado' ? 'registrado' : status;
}

export function paymentSummary(order: Pick<PedidoFirestore, 'total' | 'paidTotal' | 'estado'>) {
  const collected = order.paidTotal ?? 0;
  const balance = Math.max(0, order.total - collected);
  let label = 'Pendiente';
  if (balance === 0) label = 'Pagado';
  else if (collected > 0) label = 'Pago parcial';
  else if (order.estado === 'cancelado') label = 'Sin cobrar';
  return { collected, balance, label };
}
