export const BRAND_NAME = "Avena Cubana Pop";
export const INSTAGRAM = "@avenacubanapop";
export const INSTAGRAM_URL = "https://www.instagram.com/avenacubanapop/";
export const WHATSAPP_PHONE = "3205772793";
export const NEQUI_PHONE = "3205772793";

export function paymentMethodLabel(method: string) {
  return method === "Transferencia" ? `Transferencia · Nequi ${NEQUI_PHONE}` : method;
}
export const BUSINESS_ADDRESS = "Cl. 7 #22-96, Popayán, Cauca";
export const BUSINESS_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS_ADDRESS)}`;

export const waLink = (msg: string) =>
  `https://api.whatsapp.com/send?phone=57${WHATSAPP_PHONE}&text=${encodeURIComponent(msg)}`;

export const BUSINESS_HOURS = {
  weekdays: "Lun - Vie: 2:00 p.m. - 9:00 p.m.",
  weekend: "Sáb - Dom: 12:00 p.m. - 10:00 p.m.",
};

// % de descuento automático que se aplica cuando la fecha del pedido coincide
// con el cumpleaños guardado del cliente. Ajusta este número para cambiarlo.
export const BIRTHDAY_DISCOUNT_PERCENT = 15;

// Umbrales para marcar clientes como VIP o inactivos en el panel de admin.
export const VIP_MIN_PEDIDOS = 5;
export const VIP_MIN_GASTADO = 200000;
export const INACTIVE_DAYS_THRESHOLD = 30;
