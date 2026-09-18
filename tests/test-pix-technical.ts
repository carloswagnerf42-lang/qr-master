import {
  formatField,
  calculateCRC16,
  formatPixKey,
  sanitizeMerchantName,
  sanitizeMerchantCity,
  sanitizeTxId,
  sanitizeInfoMessage,
  formatAmount,
  generatePixPayload,
  parsePixPayload,
} from "../src/lib/pix";

// Cores ANSI para o terminal
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName}`);
    if (detail) console.error(`    ${YELLOW}Detalhes:${RESET} ${detail}`);
  }
}

console.log(`\n${CYAN}====================================================${RESET}`);
console.log(`${CYAN}   BATERIA DE TESTES TÉCNICOS: MÓDULO PIX / BR CODE  ${RESET}`);
console.log(`${CYAN}====================================================${RESET}\n`);

// -----------------------------------------------------------------
// 1. TESTES DO ALGORITMO CRC16-CCITT (Tag 63)
// -----------------------------------------------------------------
console.log(`${YELLOW}[1/8] Testes do Algoritmo CRC16-CCITT (Polinômio 0x1021, Init 0xFFFF)${RESET}`);

// Vetor padrão CCITT: "123456789" -> 0x29B1
const crcStandard = calculateCRC16("123456789");
assert(crcStandard === "29B1", "CRC16-CCITT vetor padrão '123456789' deve ser 29B1", `Obtido: ${crcStandard}`);

// String vazia
const crcEmpty = calculateCRC16("");
assert(crcEmpty === "FFFF", "CRC16 de string vazia deve ser FFFF", `Obtido: ${crcEmpty}`);

// Formatação com 4 dígitos hexadecimais em maiúsculas
assert(crcStandard.length === 4 && /^[0-9A-F]{4}$/.test(crcStandard), "CRC16 deve possuir exatamente 4 caracteres hexadecimais maiúsculos");

// -----------------------------------------------------------------
// 2. TESTES DE NORMALIZAÇÃO DE CHAVES PIX (DICT / Bacen)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[2/8] Testes de Normalização de Chaves Pix (DICT / Bacen)${RESET}`);

// CPF
const cpfClean = formatPixKey("12345678909");
assert(cpfClean.valid && cpfClean.keyType === "CPF" && cpfClean.formattedKey === "12345678909", "CPF sem pontuação reconhecido e mantido");

const cpfFormatted = formatPixKey("123.456.789-09");
assert(cpfFormatted.valid && cpfFormatted.keyType === "CPF" && cpfFormatted.formattedKey === "12345678909", "CPF com pontuação limpo para 11 dígitos");

// CNPJ
const cnpjClean = formatPixKey("12345678000195");
assert(cnpjClean.valid && cnpjClean.keyType === "CNPJ" && cnpjClean.formattedKey === "12345678000195", "CNPJ sem pontuação reconhecido");

const cnpjjFormatted = formatPixKey("12.345.678/0001-95");
assert(cnpjjFormatted.valid && cnpjjFormatted.keyType === "CNPJ" && cnpjjFormatted.formattedKey === "12345678000195", "CNPJ formatado limpo para 14 dígitos");

// Telefone
const phoneInternational = formatPixKey("+5511987654321");
assert(phoneInternational.valid && phoneInternational.keyType === "PHONE" && phoneInternational.formattedKey === "+5511987654321", "Telefone E.164 com '+' mantido");

const phoneLocalMask = formatPixKey("(11) 98765-4321");
assert(phoneLocalMask.valid && phoneLocalMask.keyType === "PHONE" && phoneLocalMask.formattedKey === "+5511987654321", "Telefone com máscara brasileira normalizado com prefixo +55");

const phoneLocalDigits = formatPixKey("11987654321");
assert(phoneLocalDigits.valid && phoneLocalDigits.keyType === "PHONE" && phoneLocalDigits.formattedKey === "+5511987654321", "Telefone celular sem +55 recebe DDI +55");

const phoneDDIWithoutPlus = formatPixKey("5511987654321");
assert(phoneDDIWithoutPlus.valid && phoneDDIWithoutPlus.keyType === "PHONE" && phoneDDIWithoutPlus.formattedKey === "+5511987654321", "Telefone 55... recebe sinal '+'");

// Email
const emailUpper = formatPixKey("Contato.Empresa@Dominio.COM.BR");
assert(emailUpper.valid && emailUpper.keyType === "EMAIL" && emailUpper.formattedKey === "contato.empresa@dominio.com.br", "E-mail convertido para minúsculas");

const emailInvalid = formatPixKey("emailinvalido.com");
assert(!emailInvalid.valid, "E-mail sem @ rejeitado");

// Chave Aleatória (EVP / UUID v4)
const evpKey = formatPixKey("A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D");
assert(evpKey.valid && evpKey.keyType === "EVP" && evpKey.formattedKey === "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "Chave EVP normalizada em minúsculas");

// Chave desconhecida / inválida
const unknownKey = formatPixKey("chave-invalida-xyz");
assert(!unknownKey.valid && unknownKey.keyType === "UNKNOWN", "Chave arbitrária inválida identificada como UNKNOWN");

// -----------------------------------------------------------------
// 3. TESTES DE SANITIZAÇÃO DE NOME E CIDADE (Tags 59 e 60)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[3/8] Testes de Sanitização de Nome (Tag 59) e Cidade (Tag 60)${RESET}`);

// Nome com acentos e caracteres especiais
const cleanName = sanitizeMerchantName("João da Silva Açaí & Cia");
assert(cleanName === "JOAO DA SILVA ACAI CIA", `Nome sanitizado sem acentos nem símbolos (${cleanName})`);

// Nome maior que 25 caracteres truncado com segurança
const longName = sanitizeMerchantName("EMPRESA BRASILEIRA DE TECNOLOGIA E SERVICOS DIGITAIS");
assert(longName.length <= 25, "Nome truncado em no máximo 25 caracteres");
assert(longName === "EMPRESA BRASILEIRA DE TEC", `Conteúdo truncado correto: ${longName}`);

// Fallback de nome vazio
assert(sanitizeMerchantName(null) === "RECEBEDOR PIX", "Nome nulo recebe fallback RECEBEDOR PIX");
assert(sanitizeMerchantName("") === "RECEBEDOR PIX", "Nome vazio recebe fallback RECEBEDOR PIX");

// Cidade com acentos
const cleanCity = sanitizeMerchantCity("São José dos Campos");
assert(cleanCity.length <= 15, "Cidade truncada em no máximo 15 caracteres");
assert(cleanCity === "SAO JOSE DOS CA", `Cidade truncada e sem acentos correta: ${cleanCity}`);

// Fallback de cidade vazia
assert(sanitizeMerchantCity(null) === "SAO PAULO", "Cidade nula recebe fallback SAO PAULO");
assert(sanitizeMerchantCity("") === "SAO PAULO", "Cidade vazia recebe fallback SAO PAULO");

// -----------------------------------------------------------------
// 4. TESTES DE TXID (Tag 62.05)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[4/8] Testes de Identificador da Transação - TXID (Tag 62.05)${RESET}`);

// TXID não informado -> Bacen exige obrigatoriamente "***"
assert(sanitizeTxId(undefined) === "***", "TXID não informado deve ser '***'");
assert(sanitizeTxId(null) === "***", "TXID nulo deve ser '***'");
assert(sanitizeTxId("") === "***", "TXID vazio deve ser '***'");
assert(sanitizeTxId("   ") === "***", "TXID com espaços deve ser '***'");

// TXID personalizado válido
assert(sanitizeTxId("PEDIDO12345") === "PEDIDO12345", "TXID alfanumérico mantido");

// TXID com caracteres especiais e acentos
assert(sanitizeTxId("PEDIDO #123-A") === "PEDIDO123A", "TXID limpo de caracteres não-alfanuméricos");

// TXID com mais de 25 caracteres truncado
const longTxId = sanitizeTxId("ABCDEFGHIJ1234567890KLMNOPQRST");
assert(longTxId.length === 25, `TXID truncado em 25 chars (obtido: ${longTxId.length})`);
assert(longTxId === "ABCDEFGHIJ1234567890KLMNO", `Conteúdo do TXID truncado correto: ${longTxId}`);

// -----------------------------------------------------------------
// 5. TESTES DE VALOR DA TRANSAÇÃO (Tag 54)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[5/8] Testes de Formatação de Valor (Tag 54)${RESET}`);

// Valor decimal numérico
assert(formatAmount(10.5) === "10.50", "10.5 formatado como 10.50");
assert(formatAmount(100) === "100.00", "100 formatado como 100.00");
assert(formatAmount(0.99) === "0.99", "0.99 formatado como 0.99");

// Valor via string com moeda ou vírgula
assert(formatAmount("1250,50") === "1250.50", "String com vírgula formatada como 1250.50");
assert(formatAmount("R$ 49,90") === "49.90", "String com R$ e espaço formatada como 49.90");

// Valores nulos, zero ou negativos DEVEM retornar null (omitir Tag 54)
assert(formatAmount(0) === null, "Valor 0 retorna null para omitir Tag 54");
assert(formatAmount("0") === null, "String '0' retorna null para omitir Tag 54");
assert(formatAmount(-10) === null, "Valor negativo retorna null");
assert(formatAmount(null) === null, "Valor nulo retorna null");
assert(formatAmount(undefined) === null, "Valor undefined retorna null");

// -----------------------------------------------------------------
// 6. GERAÇÃO COMPLETA DE PAYLOAD BR CODE (generatePixPayload)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[6/8] Testes de Geração Completa de Payload BR Code${RESET}`);

// Caso A: Pix Estático com Valor Fixo e TXID
const payloadA = generatePixPayload({
  pixKey: "123.456.789-09",
  merchantName: "João da Silva",
  merchantCity: "São Paulo",
  amount: 150.75,
  txId: "PEDIDO123",
});

assert(payloadA.startsWith("000201010212"), "Inicia com Tag 00 (01) e Tag 01 (12 - estático)");
assert(payloadA.includes("26330014br.gov.bcb.pix011112345678909"), "Contém Tag 26 com GUI br.gov.bcb.pix e CPF normalizado");
assert(payloadA.includes("520400005303986"), "Contém MCC 0000 e moeda 986 (BRL)");
assert(payloadA.includes("5406150.75"), "Contém Tag 54 com valor exato 150.75");
assert(payloadA.includes("5802BR"), "Contém código de país BR");
assert(payloadA.includes("5913JOAO DA SILVA"), "Contém Tag 59 com nome sanitizado e tamanho correto (13)");
assert(payloadA.includes("6009SAO PAULO"), "Contém Tag 60 com cidade sanitizada e tamanho correto (09)");
assert(payloadA.includes("62130509PEDIDO123"), "Contém Tag 62 com TXID PEDIDO123");
assert(payloadA.includes("6304"), "Termina com identificador da Tag 63 (6304)");

// Caso B: Pix Estático SEM valor (valor aberto / dinâmico pelo pagador) e SEM TXID
const payloadB = generatePixPayload({
  pixKey: "contato@minhaempresa.com.br",
  merchantName: "Minha Empresa",
  merchantCity: "Curitiba",
  amount: null, // Sem valor
  txId: "",     // Sem txid -> Bacen exige '***'
});

assert(!payloadB.includes("540"), "Payload sem valor OMITIU Tag 54 com sucesso");
assert(payloadB.includes("62070503***"), "Payload sem TXID contém 62070503*** conforme Bacen");
assert(payloadB.includes("contato@minhaempresa.com.br"), "Contém e-mail correto");

// Caso C: Pix com Chave Aleatória (EVP) e Mensagem Adicional (Tag 26.02)
const payloadC = generatePixPayload({
  pixKey: "123e4567-e89b-12d3-a456-426614174000",
  merchantName: "Padaria Central",
  merchantCity: "Rio de Janeiro",
  amount: "25.00",
  txId: "***",
  infoMessage: "Cafe da manha",
});

assert(payloadC.includes("123e4567-e89b-12d3-a456-426614174000"), "Contém chave EVP");
assert(payloadC.includes("0213Cafe da manha"), "Contém mensagem adicional na subtag 26.02");

// -----------------------------------------------------------------
// 7. DECODIFICAÇÃO E VALIDAÇÃO DE INTEGRIDADE (parsePixPayload)
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[7/8] Testes de Decodificação e Verificação Criptográfica (parsePixPayload)${RESET}`);

// Testar decodificação do Payload A
const parsedA = parsePixPayload(payloadA);
assert(parsedA.valid === true, "Payload A decodificado com valid=true");
assert(parsedA.crcValid === true, "CRC16 do Payload A verificado e validado com sucesso");
assert(parsedA.pixKey === "12345678909", "Chave CPF extraída corretamente");
assert(parsedA.keyType === "CPF", "Tipo de chave CPF identificado pelo parser");
assert(parsedA.merchantName === "JOAO DA SILVA", "Nome do recebedor extraído corretamente");
assert(parsedA.merchantCity === "SAO PAULO", "Cidade do recebedor extraída corretamente");
assert(parsedA.amount === 150.75, "Valor numérico 150.75 extraído corretamente");
assert(parsedA.txId === "PEDIDO123", "TXID PEDIDO123 extraído corretamente");

// Testar decodificação do Payload B
const parsedB = parsePixPayload(payloadB);
assert(parsedB.valid === true, "Payload B decodificado com valid=true");
assert(parsedB.crcValid === true, "CRC16 do Payload B verificado com sucesso");
assert(parsedB.amount === null, "Payload B sem valor extraído como null");
assert(parsedB.txId === "***", "Payload B com TXID '***' extraído corretamente");

// Testar decodificação do Payload C
const parsedC = parsePixPayload(payloadC);
assert(parsedC.valid === true, "Payload C decodificado com valid=true");
assert(parsedC.crcValid === true, "CRC16 do Payload C verificado com sucesso");
assert(parsedC.infoMessage === "Cafe da manha", "Mensagem de informação extraída corretamente");

// -----------------------------------------------------------------
// 8. TESTES DE RESISTÊNCIA A FRAUDES E CORRUPÇÃO DE DADOS
// -----------------------------------------------------------------
console.log(`\n${YELLOW}[8/8] Testes de Resistência a Fraudes e Alteração de Bytes${RESET}`);

// Alteração maliciosa: trocar o valor de 150.75 para 950.75 sem recalcular CRC
const tamperedPayload = payloadA.replace("150.75", "950.75");
const parsedTampered = parsePixPayload(tamperedPayload);
assert(parsedTampered.valid === false, "Payload adulterado REJEITADO pelo parser");
assert(parsedTampered.crcValid === false, "Falha de checksum CRC16 detectada com precisão");

// Payload truncado
const truncatedPayload = payloadA.substring(0, payloadA.length - 10);
const parsedTruncated = parsePixPayload(truncatedPayload);
assert(parsedTruncated.valid === false, "Payload truncado rejeitado");

// Payload vazio / malformado
const parsedEmpty = parsePixPayload("");
assert(parsedEmpty.valid === false, "Payload vazio rejeitado");

// -----------------------------------------------------------------
// RESUMO FINAL
// -----------------------------------------------------------------
console.log(`\n${CYAN}====================================================${RESET}`);
console.log(`${CYAN}               RESUMO DA AUDITORIA PIX              ${RESET}`);
console.log(`${CYAN}====================================================${RESET}`);
console.log(`Total de testes executados: ${totalTests}`);
console.log(`${GREEN}Passaram: ${passedTests}${RESET}`);
if (failedTests > 0) {
  console.log(`${RED}Falharam: ${failedTests}${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}TODOS OS TESTES TÉCNICOS DO MÓDULO PIX PASSARAM COM SUCESSO!${RESET}\n`);
  process.exit(0);
}
