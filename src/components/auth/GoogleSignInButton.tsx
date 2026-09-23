"use client";

import React, { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (error: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
  disabled?: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (parent: HTMLElement, options: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  text = "continue_with",
  disabled = false,
}: GoogleSignInButtonProps) {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;

    // Carrega script oficial do Google Identity Services de forma assíncrona
    const scriptId = "google-gsi-client";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    const handleScriptLoad = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: { credential?: string }) => {
              if (response.credential) {
                onSuccess(response.credential);
              } else {
                onError?.("Nenhuma credencial recebida do Google.");
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          setLoaded(true);
        } catch (err) {
          console.error("Erro ao inicializar Google Identity:", err);
        }
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = handleScriptLoad;
      document.head.appendChild(script);
    } else if (window.google?.accounts?.id) {
      handleScriptLoad();
    }
  }, [clientId, onSuccess, onError]);

  const handleClick = () => {
    if (!clientId) {
      toast.info(
        "Autenticação Google",
        "Configuração pendente: defina NEXT_PUBLIC_GOOGLE_CLIENT_ID no arquivo .env ou no painel da Vercel para ativar o login direto."
      );
      return;
    }

    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt();
      } catch (err) {
        console.error("Erro ao abrir prompt Google:", err);
      }
    } else {
      toast.error("Erro ao carregar Google", "Não foi possível carregar o serviço do Google. Verifique sua conexão.");
    }
  };

  const buttonText =
    text === "signup_with"
      ? "Cadastrar com Google"
      : text === "signin_with"
      ? "Entrar com Google"
      : "Continuar com Google";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 text-slate-100 font-semibold text-xs border border-slate-700/80 shadow-sm flex items-center justify-center gap-3 transition-all active:scale-[0.99] disabled:opacity-50"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
      </svg>
      <span>{buttonText}</span>
    </button>
  );
}
