// Gmail may return an RFC 2047 encoded subject in the full MIME payload.
function noticeSubject(value) {
  return value.replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=/gi, (_, charset, encoding, content) => {
    if (!/^(utf-8|iso-8859-1|us-ascii)$/i.test(charset)) return '';
    const bytes = encoding.toLowerCase() === 'b' ? Utilities.base64Decode(content)
      : (content.replace(/_/g, ' ').match(/=[a-f0-9]{2}|./gi) || []).map(c => c.length === 3 ? parseInt(c.slice(1),16) : c.charCodeAt(0)).map(b => b > 127 ? b-256 : b);
    return Utilities.newBlob(bytes).getDataAsString(charset);
  });
}
// Automatic forwarding preserves the bank's From, To and original Message-ID.
function parseBankNotice(headers, body, trustedRecipients, reportar = () => {}) {
  const omitir = motivo => { reportar(motivo); return null; };
  const values = name => headers.filter(h => h.name.toLowerCase() === name).map(h => h.value.replace(/\r?\n[ \t]+/g, ' ').trim());
  const mailbox = value => (value.match(/^[^<>,;]*<([^<>,;\s]+)>$/)?.[1] || value).trim().toLowerCase();
  const senders = values('from');
  if (senders.length !== 1) return omitir('Remitente ambiguo.');
  const sender = mailbox(senders[0]);
  const bancolombia = sender === 'alertasynotificaciones@ayn.notificacionesbancolombia.com';
  if (!bancolombia && sender !== 'notificaciones@nequi.com.co') return omitir('Remitente desconocido.');
  if (!values('to').some(value => value.split(',').some(to => trustedRecipients.includes(mailbox(to))))) return omitir('El destinatario original no está en CORREOS_RECEPTORES.');

  // Only interpret the authentication results from Gmail's outer inbound SMTP hop.
  const hop = headers.findIndex(h => h.name.toLowerCase() === 'received' && /\bby\s+mx\.google\.com\b/i.test(h.value));
  if (hop < 0) return omitir('Falta la cabecera de recepción de Gmail.');
  const hopHeaders = [];
  for (const h of headers.slice(hop + 1)) {
    if (h.name.toLowerCase() === 'received') break;
    if (h.name.toLowerCase() === 'authentication-results') hopHeaders.push(h.value.replace(/\s+/g, ' '));
  }
  if (hopHeaders.length !== 1 || !/^mx\.google\.com\s*;/i.test(hopHeaders[0])) return omitir('Falta el resultado de autenticación de Gmail.');
  const results = hopHeaders[0].split(';').map(part => part.trim());
  const fromDomain = sender.split('@')[1];
  const signingDomain = bancolombia ? 'notificacionesbancolombia.com' : 'nequi.com.co';
  const dmarc = results.some(r => /^dmarc=pass\b/i.test(r) &&
    r.match(/\bheader\.from=([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase() === fromDomain);
  const dkim = results.some(r => {
    if (!/^dkim=pass\b/i.test(r)) return false;
    const domain = r.match(/\bheader\.(?:d=|i=[^@\s]*@)([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase();
    return domain === signingDomain || domain?.endsWith('.' + signingDomain);
  });
  if (!dmarc || !dkim) return omitir('Gmail no confirmó DMARC y DKIM del banco.');
  const subject = noticeSubject(values('subject')[0] || '').trim();
  if (!(bancolombia ? /^Alertas y Notificaciones$/i : /^¡?Recibiste plata por Bre[-‑]B!?$/i).test(subject)) return omitir('Asunto no admitido.');
  const ids = values('message-id');
  if (ids.length !== 1 || !/^<[^<>\s]+@[^<>\s]+>$/.test(ids[0])) return omitir('Falta el identificador original del correo.');
  const text = body.replace(/\s+/g, ' ').trim();
  if (bancolombia) {
    const payments = [...text.matchAll(/\bBancolombia:\s*AVENA CUBANA(?: POP)?,\s*recibiste un pago de ([\p{L}\p{M} .’'-]{2,120}?) por \$\s*([\d.,]+) en tu cuenta \*+(\d{4})\b/giu)];
    if (payments.length !== 1) return omitir('El texto no identifica un único pago recibido por Avena Cubana.');
    const [, payer, value, account] = payments[0];
    let amount;
    if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value)) {
      amount = Number(value.replace(/,/g, ''));
    } else if (/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{2})?$/.test(value)) {
      amount = Number(value.replace(/\./g, '').replace(',', '.'));
    }
    if (!(amount > 0 && amount < 1e13)) return omitir('Importe no reconocido.');
    return { messageId: ids[0], reference: null, payer: payer.trim(), amount, account };
  }
  const credits = [...text.matchAll(/\bRecibiste\s+(?:COP\s*)?\$?\s*((?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:,\d{2})?)\s+de\s+([\p{L}][\p{L}\p{M} .’'-]{1,99}?)\s+el\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\b/giu)];
  if (credits.length !== 1) return omitir('El texto no identifica un único abono Nequi.');
  const amount = Number(credits[0][1].replace(/\./g, '').replace(',', '.'));
  if (!(amount > 0 && amount < 1e13)) return omitir('Importe no reconocido.');
  const reference = text.match(/\b(?:referencia de (?:la )?transacción|ID de (?:la )?transacción)\s*:\s*([a-z0-9-]{6,64})\b/i)?.[1];
  const account = text.match(/\bcuenta (?:de destino|receptora)\s*(?:terminada en|:)\s*[*x•\s]*(\d{4})(?!\d)/i)?.[1];
  return { messageId: ids[0], reference: reference || null, payer: credits[0][2].trim(), amount, account: account || null };
}

function noticeBody(part, messageId) {
  if (!part || part.filename) return '';
  const tipo = (part.mimeType || '').toLowerCase();
  if (tipo.startsWith('multipart/')) {
    const partes = part.parts || [];
    if (tipo === 'multipart/alternative') {
      const ordenadas = partes.slice().sort((a, b) =>
        Number(b.mimeType === 'text/plain') - Number(a.mimeType === 'text/plain'));
      for (const alternativa of ordenadas) {
        const texto = noticeBody(alternativa, messageId);
        if (texto.trim()) return texto;
      }
      return '';
    }
    return partes.map(hija => noticeBody(hija, messageId)).filter(Boolean).join(' ');
  }
  if (tipo !== 'text/plain' && tipo !== 'text/html') return '';
  const cuerpo = part.body || {};
  let datos = cuerpo.data;
  if (!datos && cuerpo.attachmentId) {
    datos = correoGmail(encodeURIComponent(messageId) + '/attachments/' +
      encodeURIComponent(cuerpo.attachmentId)).data;
  }
  if (!datos) return '';
  const base64url = datos.replace(/\s/g, '');
  const bytes = Utilities.base64DecodeWebSafe(base64url.padEnd(Math.ceil(base64url.length / 4) * 4, '='));
  const cabecera = (part.headers || []).find(h => h.name.toLowerCase() === 'content-type');
  const charset = cabecera && cabecera.value.match(/\bcharset\s*=\s*["']?([\w.-]+)/i);
  const texto = Utilities.newBlob(bytes).getDataAsString(charset ? charset[1] : 'UTF-8');
  if (tipo === 'text/plain') return texto;
  return texto.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n)));
}
