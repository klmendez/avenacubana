const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const parser = vm.runInNewContext(fs.readFileSync(path.join(__dirname, "Nequi.gs"), "utf8") + "\nparseBankNotice");
const h = (name, value) => ({name, value});
const auth = "mx.google.com; dkim=pass header.i=@nequi.com.co; dmarc=pass header.from=nequi.com.co";
const headers = [
  h("Received", "from mail.example by mx.google.com with ESMTPS"),
  h("Authentication-Results", auth), h("Received","by original-mx.example"),
  h("From","Nequi <notificaciones@nequi.com.co>"), h("To","cuenta@example.com"),
  h("Subject","¡Recibiste plata por Bre-B!"), h("Message-ID","<aviso@nequi.com.co>")
];
const body = "¡Hola, Persona Receptora! Recibiste 122.000 de MARÍA GONZÁLEZ el 28 de octubre de 2026 a las 11:21 a.m, desde el banco Daviplata.";
const parse = (hs=headers, text=body) => parser(hs,text,["cuenta@example.com"]);
test("lee al ordenante del formato Nequi y conserva la identidad en el reenvío", () => {
  const {amount,payer,account,messageId} = parse();
  assert.equal(amount,122000);assert.equal(payer,"MARÍA GONZÁLEZ");assert.equal(account,null);
  assert.equal(parse([h("X-Forwarded-To","central@example.com"),...headers]).messageId,messageId);
  assert.equal(parse(headers,body+" Cuenta receptora: ****8941.").account,"8941");
});
test("rechaza mensajes no autenticados y correos para otras cuentas", () => {
  for (const hs of [headers.slice(1), headers.filter(x=>x.name!=="Message-ID"),
    headers.map(x=>x.name==="Authentication-Results"?h(x.name,auth.replace("dkim=pass","dkim=fail")):x),
    headers.map(x=>x.name==="From"?h(x.name,"notificaciones@nequi.com.co.example"):x),
    headers.map(x=>x.name==="To"?h(x.name,"otra@example.com"):x),
    [...headers.slice(0,1),h("Received","from other.example"),...headers.slice(1)]]) assert.equal(parse(hs),null);
});
test("rechaza avisos de salida, importes mal formados y textos ambiguos", () => {
  for (const s of [body.replace("Recibiste","Enviaste"),body.replace("122.000","12.20"),body+" "+body]) assert.equal(parse(headers,s),null);
});

test("lee pagos QR de Bancolombia y comprueba la identidad del remitente", () => {
  const sender = "alertasynotificaciones@ayn.notificacionesbancolombia.com";
  const values = {"From":sender,"Subject":"Alertas y Notificaciones","Authentication-Results":
    "mx.google.com; dkim=pass header.i=@notificacionesbancolombia.com; dmarc=pass header.from=ayn.notificacionesbancolombia.com"};
  const hs = headers.map(x => h(x.name, values[x.name] || x.value));
  const credit = "Bancolombia: AVENA CUBANA, recibiste un pago de RONALD SANTIAGO GUEVARA RUANO por $55.00 en tu cuenta *4054 conectado a la llave";
  const n = parse(hs, credit);
  assert.equal(n.amount,55); assert.equal(n.account,"4054"); assert.equal(n.payer,"RONALD SANTIAGO GUEVARA RUANO");
  for (const value of ["55,000.00","55.000,00"]) assert.equal(parse(hs,credit.replace("55.00",value)).amount,55000);
  for (const value of ["5.5.0","0.00"]) assert.equal(parse(hs,credit.replace("55.00",value)),null);
  assert.equal(parse(hs,credit.replace("recibiste","enviaste")),null);
  assert.equal(parse(hs,credit+" "+credit),null);
  assert.equal(parse(hs.map(x=>x.name==="Authentication-Results"?h(x.name,auth):x), credit),null);
});
