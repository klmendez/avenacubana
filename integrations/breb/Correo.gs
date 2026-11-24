const CENTRAL = 'avenacubanapop@gmail.com';
const PROJECT = 'https://vnvnsxkhqanwfbxcsvqz.supabase.co';

function configBreb() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('BREB_INGEST_KEY');
  const api = props.getProperty('SUPABASE_PUBLISHABLE_KEY');
  const recipients = (props.getProperty('CORREOS_RECEPTORES') || '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
  if (!key || !api || !recipients.length) throw Error('Configura las tres propiedades del conector.');
  if (Gmail.Users.getProfile('me').emailAddress.toLowerCase() !== CENTRAL) throw Error('Autoriza desde el correo central de Avena Cubana Pop.');
  return {props, key, api, recipients};
}

function activarBreb() {
  const {props} = configBreb();
  if (!props.getProperty('BREB_DESDE')) props.setProperty('BREB_DESDE', String(Math.floor(Date.now()/1000)));
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'leerBreb'))
    ScriptApp.newTrigger('leerBreb').timeBased().everyMinutes(1).create();
}

function brebHash(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('');
}

function leerBreb() {
  procesarLoteBreb(false);
}

// Ejecutar a mano para ver en el registro el resultado del lote pendiente.
function comprobarBreb() {
  procesarLoteBreb(true);
}

function correoGmail(ruta) {
  const respuesta = UrlFetchApp.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + ruta,
    {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true}
  );
  if (respuesta.getResponseCode() !== 200) {
    throw Error('Gmail no pudo leer el mensaje. HTTP ' + respuesta.getResponseCode());
  }
  return JSON.parse(respuesta.getContentText());
}

function procesarLoteBreb(diagnostico) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(diagnostico ? 15000 : 1000)) {
    if (diagnostico) console.log('Hay otra lectura en curso. Ejecuta comprobarBreb otra vez en un minuto.');
    return;
  }
  try {
    const {props, key, api, recipients} = configBreb();
    const start = Number(props.getProperty('BREB_DESDE'));
    if (!start) throw Error('Ejecuta activarBreb primero.');
    // Fixed upper bound across pages. Overlap catches mail indexed shortly after delivery.
    const end = Number(props.getProperty('BREB_HASTA')) || Math.floor(Date.now()/1000);
    props.setProperty('BREB_HASTA', String(end));
    const query = '{from:notificaciones@nequi.com.co from:alertasynotificaciones@ayn.notificacionesbancolombia.com} after:' + (start-120) + ' before:' + end;
    const token = props.getProperty('BREB_PAGINA');
    let batch;
    try {
      batch = Gmail.Users.Messages.list('me', {q: query, maxResults: 50, ...(token ? {pageToken: token} : {})});
    } catch (error) {
      props.deleteProperty('BREB_PAGINA');
      throw error;
    }
    enviarAvisos(batch, key, api, recipients, diagnostico);
    if (batch.nextPageToken) props.setProperty('BREB_PAGINA',batch.nextPageToken);
    else { props.setProperty('BREB_DESDE',String(end)); props.deleteProperty('BREB_HASTA'); props.deleteProperty('BREB_PAGINA'); }
  } finally { lock.releaseLock(); }
}

function enviarAvisos(batch, key, api, recipients, diagnostico) {
  let enviados = 0;
  const mensajes = batch.messages || [];
  for (const row of mensajes) {
    const message = correoGmail(encodeURIComponent(row.id) + '?format=full');
    if ((message.labelIds || []).some(label => ['SPAM','TRASH','SENT','DRAFT'].includes(label))) continue;
    const reportar = motivo => { if (diagnostico) console.log('Omitido: ' + motivo); };
    const notice = parseBankNotice(message.payload.headers, noticeBody(message.payload, row.id), recipients, reportar);
    if (!notice) {
      continue;
    }
    const payload = {p_message_key: brebHash(notice.messageId), p_transfer_key: notice.reference ? brebHash('nequi:' + notice.reference) : null,
      p_payer: notice.payer, p_amount: notice.amount, p_account_last4: notice.account, p_received_at: new Date(Number(message.internalDate)).toISOString()};
    const response = UrlFetchApp.fetch(PROJECT+'/rest/v1/rpc/ingest_breb_notice', {method:'post', contentType:'application/json',
      headers:{apikey:api, 'x-breb-key':key}, payload:JSON.stringify(payload), muteHttpExceptions:true});
    if (response.getResponseCode() !== 204 && response.getResponseCode() !== 200) throw Error('Error de ingreso Bre-B: HTTP '+response.getResponseCode());
    enviados++;
  }
  if (diagnostico || mensajes.length) {
    console.log('Correos encontrados: ' + mensajes.length + '. Avisos aceptados por el portal (incluye repetidos): ' + enviados + '.');
  }
}

function recuperarBancolombia23Nov() {
  const {key, api, recipients} = configBreb();
  const inicio = Date.parse('2026-11-23T00:00:00-05:00') / 1000;
  const fin = inicio + 86400;
  const q = 'from:alertasynotificaciones@ayn.notificacionesbancolombia.com after:' + (inicio - 1) + ' before:' + fin;
  let pageToken;
  do {
    const batch = Gmail.Users.Messages.list('me', {q, maxResults: 50, ...(pageToken ? {pageToken} : {})});
    enviarAvisos(batch, key, api, recipients, true);
    pageToken = batch.nextPageToken;
  } while (pageToken);
}
