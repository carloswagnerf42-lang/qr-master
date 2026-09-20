/**
 * Utilitário central de eventos para o fluxo de criação de QR Codes.
 * Permite que botões globais (Header, Sidebar, atalhos) reiniciem o criador
 * de forma determinística e client-side, sem recarregar a página e sem requisições indevidas.
 */

export const NEW_QR_EVENT = "qr-master:new-qr";

export function triggerNewQRCreation() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NEW_QR_EVENT));
  }
}
