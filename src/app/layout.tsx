import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "QR MASTER — Plataforma Profissional de QR Codes",
  description: "Crie, personalize, gerencie e analise QR Codes estáticos e dinâmicos com qualidade visual incomparável e estatísticas completas.",
  keywords: ["QR Code", "QR Code Dinâmico", "Gerador Pix", "Analytics QR Code", "SaaS QR Code", "QR Code WhatsApp"],
  authors: [{ name: "QR MASTER Team" }],
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased transition-colors duration-200">
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
