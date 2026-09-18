/**
 * Módulo oficial de geração e validação de payloads Pix (BR Code estático)
 * em estrita conformidade com os Manuais do Banco Central do Brasil (Bacen)
 * e especificações EMVCo QRCPS-MPM.
 *
 * Referências normativas:
 * 1. Banco Central do Brasil — Manual de Padrões para Iniciação do Pix (Resolução BCB nº 1/2020)
 * 2. Banco Central do Brasil — Especificações Técnicas do Padrão BR Code v2.0.0
 * 3. EMVCo — EMV® Quality Response Code Specification for Payment Systems (EMV QRCPS) MPM v1.0
 */

export type PixKeyType = "CPF" | "CNPJ" | "PHONE" | "EMAIL" | "EVP" | "UNKNOWN";

export interface PixPayloadParams {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount?: number | string | null;
  txId?: string | null;
  infoMessage?: string | null;
}

export interface PixKeyFormatResult {
  formattedKey: string;
  keyType: PixKeyType;
  valid: boolean;
  error?: string;
}

export interface DecodedPixPayload {
  valid: boolean;
  error?: string;
  payloadFormatIndicator?: string;
  pointOfInitiationMethod?: string;
  gui?: string;
  pixKey?: string;
  keyType?: PixKeyType;
  infoMessage?: string;
  merchantCategoryCode?: string;
  currencyCode?: string;
  amount?: number | null;
  countryCode?: string;
  merchantName?: string;
  merchantCity?: string;
  txId?: string;
  crcReceived?: string;
  crcCalculated?: string;
  crcValid?: boolean;
}

/**
 * Formata um campo no padrão EMV TLV (Tag-Length-Value)
 * O tamanho (Length) representa a quantidade exata de bytes em UTF-8 codificada em 2 dígitos.
 */
export function formatField(id: string, value: string): string {
  const byteLength = Buffer.byteLength(value, "utf-8");
  const len = byteLength.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Cálculo oficial de CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF, sem reflexão e sem XOR final)
 * Conforme padrão ISO/IEC 13239 e especificação EMVCo QRCPS MPM (Tag 63).
 */
export function calculateCRC16(str: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Normaliza e identifica o tipo de chave Pix de acordo com as regras do DICT / Bacen:
 * - CPF: 11 dígitos numéricos
 * - CNPJ: 14 dígitos numéricos
 * - Telefone: Formato internacional E.164 (+55DD9XXXXXXXX)
 * - Email: Formato RFC 5322 (máx 77 caracteres, minúsculas)
 * - EVP (Chave Aleatória): UUID v4 de 36 caracteres (minúsculas com hifens)
 */
export function formatPixKey(rawKey: string): PixKeyFormatResult {
  if (!rawKey || typeof rawKey !== "string") {
    return { formattedKey: "", keyType: "UNKNOWN", valid: false, error: "Chave Pix não fornecida." };
  }

  const clean = rawKey.trim();

  // 1. E-mail
  if (clean.includes("@")) {
    const emailLower = clean.toLowerCase();
    const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    if (emailRegex.test(emailLower) && emailLower.length <= 77) {
      return { formattedKey: emailLower, keyType: "EMAIL", valid: true };
    }
    return { formattedKey: emailLower, keyType: "EMAIL", valid: false, error: "E-mail com formato inválido." };
  }

  // 2. Chave Aleatória (EVP / UUID v4)
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (uuidRegex.test(clean)) {
    return { formattedKey: clean.toLowerCase(), keyType: "EVP", valid: true };
  }

  // 3. Telefone celular internacional já iniciado com '+'
  if (clean.startsWith("+")) {
    const digitsOnly = clean.replace(/\D/g, "");
    if (digitsOnly.length >= 12 && digitsOnly.length <= 14) {
      return { formattedKey: `+${digitsOnly}`, keyType: "PHONE", valid: true };
    }
  }

  // 4. Apenas dígitos (CPF, CNPJ ou Telefone local)
  const onlyDigits = clean.replace(/\D/g, "");

  // CPF (11 dígitos)
  if (onlyDigits.length === 11) {
    // Pode ser CPF ou telefone local sem +55. Se continha parênteses ou traço característico de telefone, prioriza telefone
    if (/^\(?\d{2}\)?\s*9\d{4}-?\d{4}$/.test(clean)) {
      return { formattedKey: `+55${onlyDigits}`, keyType: "PHONE", valid: true };
    }
    return { formattedKey: onlyDigits, keyType: "CPF", valid: true };
  }

  // CNPJ (14 dígitos)
  if (onlyDigits.length === 14) {
    return { formattedKey: onlyDigits, keyType: "CNPJ", valid: true };
  }

  // Telefone local com 10 dígitos (DDD + 8 dígitos)
  if (onlyDigits.length === 10) {
    return { formattedKey: `+55${onlyDigits}`, keyType: "PHONE", valid: true };
  }

  // Telefone com DDI 55 sem o sinal de '+'
  if (onlyDigits.length === 13 && onlyDigits.startsWith("55")) {
    return { formattedKey: `+${onlyDigits}`, keyType: "PHONE", valid: true };
  }

  return { formattedKey: clean, keyType: "UNKNOWN", valid: false, error: "Formato de chave Pix não reconhecido." };
}

/**
 * Sanitiza e normaliza o nome do recebedor (Tag 59):
 * - Maiúsculas
 * - Sem acentos ou diacríticos (ASCII)
 * - Caracteres permitidos: A-Z, 0-9 e espaço
 * - Comprimento máximo: 25 caracteres
 * - Fallback: "RECEBEDOR PIX"
 */
export function sanitizeMerchantName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "RECEBEDOR PIX";

  const sanitized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, 25);

  return sanitized || "RECEBEDOR PIX";
}

/**
 * Sanitiza e normaliza a cidade do recebedor (Tag 60):
 * - Maiúsculas
 * - Sem acentos ou diacríticos (ASCII)
 * - Caracteres permitidos: A-Z, 0-9 e espaço
 * - Comprimento máximo: 15 caracteres
 * - Fallback: "SAO PAULO"
 */
export function sanitizeMerchantCity(city: string | null | undefined): string {
  if (!city || typeof city !== "string") return "SAO PAULO";

  const sanitized = city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, 15);

  return sanitized || "SAO PAULO";
}

/**
 * Sanitiza o Identificador da Transação - txid (Tag 62.05):
 * - No Pix estático, se não informado ou vazio, o padrão do Bacen é obrigatoriamente "***"
 * - Se informado: alfanumérico sem espaços [A-Za-z0-9], máximo 25 caracteres.
 */
export function sanitizeTxId(txId: string | null | undefined): string {
  if (!txId || typeof txId !== "string" || txId.trim() === "" || txId.trim() === "***") {
    return "***";
  }

  const sanitized = txId
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 25);

  return sanitized || "***";
}

/**
 * Sanitiza mensagem adicional / descrição (Tag 26.02):
 * - Alfanumérico sem acentos
 * - Máximo de 25 caracteres
 */
export function sanitizeInfoMessage(msg: string | null | undefined): string | null {
  if (!msg || typeof msg !== "string") return null;

  const sanitized = msg
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .substring(0, 25);

  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Normaliza o valor da transação (Tag 54):
 * - Aceita número ou string decimal
 * - Se ausente, nulo, zero ou negativo, retorna null (a tag 54 deve ser OMITIDA no Pix estático)
 * - Se válido, retorna string formatada com ponto e exatamente 2 casas decimais (ex: "10.50")
 */
export function formatAmount(amount: number | string | null | undefined): string | null {
  if (amount === undefined || amount === null) return null;

  let num: number;
  if (typeof amount === "string") {
    const cleaned = amount.replace(/[R$\s]/g, "").replace(",", ".");
    num = parseFloat(cleaned);
  } else {
    num = amount;
  }

  if (isNaN(num) || num <= 0) return null;

  return num.toFixed(2);
}

/**
 * Gera o payload oficial do Pix (BR Code estático) segundo a ordem e especificações do Banco Central:
 *
 *  Tag 00: Payload Format Indicator ("01")
 *  Tag 01: Point of Initiation Method ("12" = estático/reutilizável)
 *  Tag 26: Merchant Account Information
 *    Subtag 00: GUI ("br.gov.bcb.pix")
 *    Subtag 01: Chave Pix
 *    Subtag 02: Descrição da transação (opcional)
 *  Tag 52: Merchant Category Code ("0000")
 *  Tag 53: Transaction Currency ("986" = BRL)
 *  Tag 54: Transaction Amount (opcional, incluído apenas se > 0)
 *  Tag 58: Country Code ("BR")
 *  Tag 59: Merchant Name (máx 25 chars)
 *  Tag 60: Merchant City (máx 15 chars)
 *  Tag 62: Additional Data Field Template
 *    Subtag 05: txid (máx 25 chars, ou "***" se não informado)
 *  Tag 63: CRC16 ("6304" + 4 caracteres hexadecimais em maiúsculas)
 */
export function generatePixPayload(params: PixPayloadParams): string {
  const { pixKey, merchantName, merchantCity, amount, txId, infoMessage } = params;

  // 1. Normalização da chave Pix
  const keyResult = formatPixKey(pixKey);
  const finalKey = keyResult.formattedKey || pixKey.trim();

  // 2. Montagem dos campos
  // Tag 00: Payload Format Indicator (fixo "01")
  let payload = formatField("00", "01");

  // Tag 01: Point of Initiation Method (fixo "12" para estático)
  payload += formatField("01", "12");

  // Tag 26: Merchant Account Information
  let merchantAccount = formatField("00", "br.gov.bcb.pix");
  merchantAccount += formatField("01", finalKey);

  const safeInfo = sanitizeInfoMessage(infoMessage);
  if (safeInfo) {
    merchantAccount += formatField("02", safeInfo);
  }
  payload += formatField("26", merchantAccount);

  // Tag 52: Merchant Category Code (fixo "0000" para genérico)
  payload += formatField("52", "0000");

  // Tag 53: Transaction Currency (fixo "986" = BRL ISO 4217)
  payload += formatField("53", "986");

  // Tag 54: Transaction Amount (opcional: omitir se nulo ou zero)
  const formattedAmt = formatAmount(amount);
  if (formattedAmt !== null) {
    payload += formatField("54", formattedAmt);
  }

  // Tag 58: Country Code (fixo "BR" ISO 3166-1)
  payload += formatField("58", "BR");

  // Tag 59: Merchant Name (máximo 25 caracteres alfanuméricos)
  const safeName = sanitizeMerchantName(merchantName);
  payload += formatField("59", safeName);

  // Tag 60: Merchant City (máximo 15 caracteres alfanuméricos)
  const safeCity = sanitizeMerchantCity(merchantCity);
  payload += formatField("60", safeCity);

  // Tag 62: Additional Data Field Template (Subtag 05 = txid)
  const safeTx = sanitizeTxId(txId);
  const additionalData = formatField("05", safeTx);
  payload += formatField("62", additionalData);

  // Tag 63: CRC16
  const payloadBeforeCRC = payload + "6304";
  const checksum = calculateCRC16(payloadBeforeCRC);

  return payloadBeforeCRC + checksum;
}

/**
 * Decodifica e valida tecnicamente um payload Pix existente no padrão EMV / BR Code.
 * Analisa as tags TLV, extrai os campos e verifica a integridade do checksum CRC16.
 */
export function parsePixPayload(payload: string): DecodedPixPayload {
  if (!payload || typeof payload !== "string" || payload.length < 20) {
    return { valid: false, error: "Payload vazio ou comprimento insuficiente." };
  }

  // 1. Verificação do CRC16
  const crcMatch = payload.match(/6304([0-9A-Fa-f]{4})$/);
  if (!crcMatch) {
    return { valid: false, error: "Tag 63 de CRC16 não encontrada no fim do payload." };
  }

  const crcReceived = crcMatch[1].toUpperCase();
  const payloadToVerify = payload.substring(0, payload.length - 4);
  const crcCalculated = calculateCRC16(payloadToVerify);
  const crcValid = crcReceived === crcCalculated;

  if (!crcValid) {
    return {
      valid: false,
      error: `Checksum CRC16 inválido. Recebido: ${crcReceived}, Calculado: ${crcCalculated}.`,
      crcReceived,
      crcCalculated,
      crcValid: false,
    };
  }

  // 2. Parseamento de Tags TLV
  const tags = new Map<string, string>();
  let idx = 0;
  const lenPayload = payload.length;

  while (idx < lenPayload) {
    if (idx + 4 > lenPayload) break;
    const tag = payload.substring(idx, idx + 2);
    const lengthStr = payload.substring(idx + 2, idx + 4);
    const length = parseInt(lengthStr, 10);

    if (isNaN(length) || length < 0) {
      return { valid: false, error: `Tamanho inválido para a tag ${tag}: "${lengthStr}".` };
    }

    const valueStart = idx + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > lenPayload) {
      return { valid: false, error: `Estouro de buffer ao ler a tag ${tag}.` };
    }

    const value = payload.substring(valueStart, valueEnd);
    tags.set(tag, value);
    idx = valueEnd;
  }

  // 3. Extração dos campos conhecidos
  const payloadFormat = tags.get("00");
  const pointOfInitiation = tags.get("01");
  const mcc = tags.get("52");
  const currency = tags.get("53");
  const amtStr = tags.get("54");
  const country = tags.get("58");
  const name = tags.get("59");
  const city = tags.get("60");

  // Parse da Tag 26 (Merchant Account Information)
  let gui: string | undefined;
  let pixKey: string | undefined;
  let infoMessage: string | undefined;

  const tag26 = tags.get("26");
  if (tag26) {
    let subIdx = 0;
    while (subIdx < tag26.length) {
      const subTag = tag26.substring(subIdx, subIdx + 2);
      const subLen = parseInt(tag26.substring(subIdx + 2, subIdx + 4), 10);
      const subVal = tag26.substring(subIdx + 4, subIdx + 4 + subLen);

      if (subTag === "00") gui = subVal;
      else if (subTag === "01") pixKey = subVal;
      else if (subTag === "02") infoMessage = subVal;

      subIdx += 4 + subLen;
    }
  }

  // Parse da Tag 62 (Additional Data Field Template - txid)
  let txId: string | undefined;
  const tag62 = tags.get("62");
  if (tag62) {
    let subIdx = 0;
    while (subIdx < tag62.length) {
      const subTag = tag62.substring(subIdx, subIdx + 2);
      const subLen = parseInt(tag62.substring(subIdx + 2, subIdx + 4), 10);
      const subVal = tag62.substring(subIdx + 4, subIdx + 4 + subLen);

      if (subTag === "05") txId = subVal;

      subIdx += 4 + subLen;
    }
  }

  const keyFormat = pixKey ? formatPixKey(pixKey) : null;

  return {
    valid: true,
    payloadFormatIndicator: payloadFormat,
    pointOfInitiationMethod: pointOfInitiation,
    gui,
    pixKey,
    keyType: keyFormat?.keyType || "UNKNOWN",
    infoMessage,
    merchantCategoryCode: mcc,
    currencyCode: currency,
    amount: amtStr ? parseFloat(amtStr) : null,
    countryCode: country,
    merchantName: name,
    merchantCity: city,
    txId,
    crcReceived,
    crcCalculated,
    crcValid: true,
  };
}
