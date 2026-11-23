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
function parseNequiNotice(headers, body, trustedRecipients) {
  const values = name => headers.filter(h => h.name.toLowerCase() === name).map(h => h.value.replace(/\r?\n[ \t]+/g, ' ').trim());
  const mailbox = value => (value.match(/^[^<>,;]*<([^<>,;\s]+)>$/)?.[1] || value).trim().toLowerCase();
  const senders = values('from');
  if (senders.length !== 1 || mailbox(senders[0]) !== 'notificaciones@nequi.com.co') return null;
  if (!values('to').some(value => value.split(',').some(to => trustedRecipients.includes(mailbox(to))))) return null;

  // Only interpret the authentication results from Gmail's outer inbound SMTP hop.
  const hop = headers.findIndex(h => h.name.toLowerCase() === 'received' && /\bby\s+mx\.google\.com\b/i.test(h.value));
  if (hop < 0) return null;
  const hopHeaders = [];
  for (const h of headers.slice(hop + 1)) {
    if (h.name.toLowerCase() === 'received') break;
    if (h.name.toLowerCase() === 'authentication-results') hopHeaders.push(h.value.replace(/\s+/g, ' '));
  }
  if (hopHeaders.length !== 1 || !/^mx\.google\.com\s*;/i.test(hopHeaders[0])) return null;
  const results = hopHeaders[0].split(';').map(part => part.trim());
  if (!results.some(r => /^dmarc=pass\b/i.test(r) && /\bheader\.from=nequi\.com\.co(?:\s|$)/i.test(r)) ||
      !results.some(r => /^dkim=pass\b/i.test(r) && /\bheader\.(?:d=|i=[^@\s]*@)(?:[\w-]+\.)*nequi\.com\.co(?:\s|$)/i.test(r))) return null;

  if (!/^¡?Recibiste plata por Bre[-‑]B!?$/i.test(noticeSubject(values('subject')[0] || '').trim())) return null;
  const ids = values('message-id');
  if (ids.length !== 1 || !/^<[^<>\s]+@[^<>\s]+>$/.test(ids[0])) return null;
  const text = body.replace(/\s+/g, ' ').trim();
  const credits = [...text.matchAll(/\bRecibiste\s+(?:COP\s*)?\$?\s*((?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)(?:,\d{2})?)\s+de\s+([\p{L}][\p{L}\p{M} .’'-]{1,99}?)\s+el\s+\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\b/giu)];
  if (credits.length !== 1) return null;
  const amount = Number(credits[0][1].replace(/\./g, '').replace(',', '.'));
  if (!(amount > 0 && amount < 1e13)) return null;
  const reference = text.match(/\b(?:referencia de (?:la )?transacción|ID de (?:la )?transacción)\s*:\s*([a-z0-9-]{6,64})\b/i)?.[1];
  const account = text.match(/\bcuenta (?:de destino|receptora)\s*(?:terminada en|:)\s*[*x•\s]*(\d{4})(?!\d)/i)?.[1];
  return { messageId: ids[0], reference: reference || null, payer: credits[0][2].trim(), amount, account: account || null };
}

function noticeBody(part) {
  if (part.filename) return '';
  if (part.parts) {
    // Prefer plain text in multipart/alternative so the same credit is not counted twice.
    const plain = part.parts.find(p => p.mimeType === 'text/plain' && !p.filename);
    return plain ? noticeBody(plain) : part.parts.map(noticeBody).join(' ');
  }
  if (!part.body?.data || !['text/plain', 'text/html'].includes(part.mimeType)) return '';
  const text = Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString('UTF-8');
  if (part.mimeType === 'text/plain') return text;
  return text.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n)));
}
