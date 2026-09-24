import {
  QRCodeType,
  QRCodeContentPayload,
  normalizeE164Phone,
  validateQRContent,
  formatQRDestination,
} from "../src/lib/qr-generator";
import { validateAndNormalizeDestination } from "../src/lib/dynamic-redirect";

console.log("==================================================");
console.log("QR-CONTENT-01: AUTOMATED PAYLOAD & FORM VALIDATION SUITE");
console.log("==================================================");

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✓ PASS: ${testName}`);
  } else {
    console.error(`✗ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// GRUPO 1: Normalização E.164 de Telefones e Formatação URI tel:
// -------------------------------------------------------------
console.log("\n--- GRUPO 1: Normalização E.164 e URI tel: ---");

const phoneCases: Array<{ input: string; expectedNormalized: string; expectedTel: string }> = [
  {
    input: "+55 11 99999-9999",
    expectedNormalized: "+5511999999999",
    expectedTel: "tel:+5511999999999",
  },
  {
    input: "(11) 99999-9999",
    expectedNormalized: "+5511999999999",
    expectedTel: "tel:+5511999999999",
  },
  {
    input: "11999999999",
    expectedNormalized: "+5511999999999",
    expectedTel: "tel:+5511999999999",
  },
  {
    input: "5511999999999",
    expectedNormalized: "+5511999999999",
    expectedTel: "tel:+5511999999999",
  },
  {
    input: "+1 (555) 123-4567",
    expectedNormalized: "+15551234567",
    expectedTel: "tel:+15551234567",
  },
  {
    input: "+44 20 7946 0958",
    expectedNormalized: "+442079460958",
    expectedTel: "tel:+442079460958",
  },
  {
    input: "11 3234-5678", // Fixo BR (10 dígitos)
    expectedNormalized: "+551132345678",
    expectedTel: "tel:+551132345678",
  },
];

for (const tc of phoneCases) {
  const normalized = normalizeE164Phone(tc.input);
  assert(
    normalized === tc.expectedNormalized,
    `normalizeE164Phone("${tc.input}") -> ${tc.expectedNormalized}`,
    `Recebido: "${normalized}"`
  );

  const formatted = formatQRDestination("phone", { phone: tc.input });
  assert(
    formatted === tc.expectedTel,
    `formatQRDestination("phone", { phone: "${tc.input}" }) -> ${tc.expectedTel}`,
    `Recebido: "${formatted}"`
  );
}

// -------------------------------------------------------------
// GRUPO 2: Validação de Entrada para Telefone (Vazio e Inválido)
// -------------------------------------------------------------
console.log("\n--- GRUPO 2: Validação de Entrada para Telefone ---");

const emptyPhoneTests: QRCodeContentPayload[] = [
  {},
  { phone: "" },
  { phone: "   " },
  { phone: undefined },
];

for (const payload of emptyPhoneTests) {
  const result = validateQRContent("phone", payload);
  assert(!result.valid, `validateQRContent("phone", ${JSON.stringify(payload)}) é rejeitado`);
  assert(!!result.error, `Mensagem de erro presente para telefone vazio`);

  const dest = formatQRDestination("phone", payload);
  assert(dest === "", `formatQRDestination("phone", ${JSON.stringify(payload)}) retorna string vazia sem mock`);
}

const invalidPhoneResult = validateQRContent("phone", { phone: "12345" });
assert(!invalidPhoneResult.valid, 'Telefone curto (< 8 dígitos) é rejeitado por validateQRContent');

const validPhoneResult = validateQRContent("phone", { phone: "(11) 99999-9999" });
assert(validPhoneResult.valid, 'Telefone completo "(11) 99999-9999" é aceito por validateQRContent');

// -------------------------------------------------------------
// GRUPO 3: Todos os 13 Tipos - Sem Mock Default em Payload Vazio
// -------------------------------------------------------------
console.log("\n--- GRUPO 3: Rejeição de Dados Vazios nos 13 Tipos ---");

const allTypes: QRCodeType[] = [
  "url",
  "text",
  "email",
  "phone",
  "sms",
  "whatsapp",
  "wifi",
  "pix",
  "contact",
  "social",
  "location",
  "event",
  "multilink",
];

for (const type of allTypes) {
  const emptyValidation = validateQRContent(type, {});
  assert(
    !emptyValidation.valid,
    `Tipo [${type}]: payload vazio {} é rejeitado por validateQRContent`,
    emptyValidation.error
  );

  const emptyDestination = formatQRDestination(type, {});
  assert(
    emptyDestination === "",
    `Tipo [${type}]: formatQRDestination({}, "${type}") retorna string vazia (sem mock silencioso)`,
    `Recebido: "${emptyDestination}"`
  );
}

// -------------------------------------------------------------
// GRUPO 4: Formatação e Validação Positiva dos 13 Tipos
// -------------------------------------------------------------
console.log("\n--- GRUPO 4: Formatação e Validação Positiva dos 13 Tipos ---");

const validPayloads: Record<QRCodeType, { payload: QRCodeContentPayload; expectedMatch: RegExp }> = {
  url: {
    payload: { url: "https://minhaloja.com.br" },
    expectedMatch: /^https:\/\/minhaloja\.com\.br$/,
  },
  text: {
    payload: { text: "Cupom exclusivo 20% OFF: VERAO2026" },
    expectedMatch: /^Cupom exclusivo 20% OFF: VERAO2026$/,
  },
  email: {
    payload: { email: "contato@empresa.com", subject: "Dúvida Comercial", body: "Olá equipe" },
    expectedMatch: /^mailto:contato@empresa\.com\?subject=D%C3%BAvida%20Comercial&body=Ol%C3%A1%20equipe$/,
  },
  phone: {
    payload: { phone: "(11) 98765-4321" },
    expectedMatch: /^tel:\+5511987654321$/,
  },
  sms: {
    payload: { phone: "(11) 98765-4321", message: "Quero agendar atendimento" },
    expectedMatch: /^sms:\+5511987654321\?body=Quero%20agendar%20atendimento$/,
  },
  whatsapp: {
    payload: { phone: "11987654321", message: "Olá, vim pelo QR Code" },
    expectedMatch: /^https:\/\/wa\.me\/5511987654321\?text=Ol%C3%A1%2C%20vim%20pelo%20QR%20Code$/,
  },
  wifi: {
    payload: { ssid: "Rede_Clientes", encryption: "WPA", password: "senhaSuperSegura123" },
    expectedMatch: /^WIFI:T:WPA;S:Rede_Clientes;P:senhaSuperSegura123;H:false;;$/,
  },
  pix: {
    payload: {
      pixKey: "12345678909",
      merchantName: "Livraria Cultura",
      merchantCity: "SAO PAULO",
      amount: 49.9,
      txId: "PEDIDO123",
    },
    expectedMatch: /^000201.*5802BR.*5916LIVRARIA CULTURA.*6009SAO PAULO.*6304/i,
  },
  contact: {
    payload: {
      firstName: "Wagner",
      lastName: "Silva",
      company: "QR Master Digital",
      cellPhone: "+5511987654321",
      contactEmail: "wagner@exemplo.com",
    },
    expectedMatch: /BEGIN:VCARD[\s\S]*FN:Wagner Silva[\s\S]*ORG:QR Master Digital[\s\S]*END:VCARD/,
  },
  social: {
    payload: { socialPlatform: "instagram", socialUrl: "qrmasteroficial" },
    expectedMatch: /^https:\/\/instagram\.com\/qrmasteroficial$/,
  },
  location: {
    payload: { latitude: -23.55052, longitude: -46.633308 },
    expectedMatch: /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-23\.55052,-46\.633308$/,
  },
  event: {
    payload: {
      eventTitle: "Workshop de Inovação 2026",
      startDate: "2026-10-15T14:00:00",
      eventLocation: "Auditório Central",
    },
    expectedMatch: /BEGIN:VCALENDAR[\s\S]*SUMMARY:Workshop de Inovação 2026[\s\S]*END:VCALENDAR/,
  },
  multilink: {
    payload: { multiLinkId: "meu-negocio" },
    expectedMatch: /^https:\/\/qrmasterdigital\.com\/m\/meu-negocio$/,
  },
};

for (const type of allTypes) {
  const testCase = validPayloads[type];
  const val = validateQRContent(type, testCase.payload);
  assert(val.valid, `Tipo [${type}]: dados válidos passam na validação`, val.error);

  const formatted = formatQRDestination(type, testCase.payload);
  assert(
    testCase.expectedMatch.test(formatted),
    `Tipo [${type}]: destino formatado confere com o padrão esperado`,
    `Recebido: "${formatted}"`
  );
}

// -------------------------------------------------------------
// GRUPO 5: dynamic-redirect validateAndNormalizeDestination
// -------------------------------------------------------------
console.log("\n--- GRUPO 5: dynamic-redirect Validação de Destinos e Segurança ---");

// tel: válido e inválido
const validTelDest = validateAndNormalizeDestination("tel:+5511999999999");
assert(validTelDest.valid && validTelDest.sanitizedUrl === "tel:+5511999999999", "tel:+5511999999999 aceito e sanitizado");

const invalidTelDest = validateAndNormalizeDestination("tel:123");
assert(!invalidTelDest.valid, "tel:123 (< 8 dígitos) rejeitado com erro");

// sms: válido e inválido
const validSmsDest = validateAndNormalizeDestination("sms:+5511999999999?body=Ola");
assert(validSmsDest.valid && validSmsDest.sanitizedUrl === "sms:+5511999999999?body=Ola", "sms:+5511999999999?body=Ola aceito");

const invalidSmsDest = validateAndNormalizeDestination("sms:abc");
assert(!invalidSmsDest.valid, "sms:abc sem dígitos rejeitado");

// mailto: válido e inválido
const validMailDest = validateAndNormalizeDestination("mailto:suporte@qrmasterdigital.com?subject=Ajuda");
assert(validMailDest.valid, "mailto:suporte@qrmasterdigital.com aceito");

const invalidMailDest = validateAndNormalizeDestination("mailto:nao-e-um-email");
assert(!invalidMailDest.valid, "mailto:nao-e-um-email malformado rejeitado");

// Esquemas especiais preservados sem https://
const pixDest = validateAndNormalizeDestination("00020126360014BR.GOV.BCB.PIX0114+55119999999995204000053039865802BR5916Nome6009Cidade62070503***6304ABCD");
assert(pixDest.valid && !pixDest.sanitizedUrl?.startsWith("https://"), "Pix EMV (000201) preservado intacto sem https://");

const vcardDest = validateAndNormalizeDestination("BEGIN:VCARD\nVERSION:3.0\nFN:Wagner Silva\nEND:VCARD");
assert(vcardDest.valid && !vcardDest.sanitizedUrl?.startsWith("https://"), "BEGIN:VCARD preservado intacto sem https://");

const vcalDest = validateAndNormalizeDestination("BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Evento\nEND:VEVENT\nEND:VCALENDAR");
assert(vcalDest.valid && !vcalDest.sanitizedUrl?.startsWith("https://"), "BEGIN:VCALENDAR preservado intacto sem https://");

const wifiDest = validateAndNormalizeDestination("WIFI:T:WPA;S:MinhaRede;P:minhasenha;;");
assert(wifiDest.valid && !wifiDest.sanitizedUrl?.startsWith("https://"), "WIFI: preservado intacto sem https://");

// Protocolos proibidos e vetores de ataque
const xssDest = validateAndNormalizeDestination("javascript:alert(document.cookie)");
assert(!xssDest.valid, "javascript: bloqueado por segurança");

const dataDest = validateAndNormalizeDestination("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==");
assert(!dataDest.valid, "data: bloqueado por segurança");

const fileDest = validateAndNormalizeDestination("file:///etc/passwd");
assert(!fileDest.valid, "file: bloqueado por segurança");

// -------------------------------------------------------------
// SUMÁRIO DOS TESTES
// -------------------------------------------------------------
console.log("\n==================================================");
console.log(`TOTAL DE TESTES: ${totalTests}`);
console.log(`TESTES APROVADOS: ${passedTests}`);
console.log(`TESTES COM FALHA: ${totalTests - passedTests}`);
console.log("==================================================");

if (passedTests === totalTests) {
  console.log("SUCESSO: Todos os testes de QR Content & Normalização passaram com louvor!");
  process.exit(0);
} else {
  process.exit(1);
}
