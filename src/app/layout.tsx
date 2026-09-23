import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com"),
  title: {
    default: "QR MASTER — QR Codes Inteligentes",
    template: "%s | QR MASTER",
  },
  description: "Crie QR Codes personalizados e dinâmicos, gerencie seus links e acompanhe métricas de escaneamento.",
  alternates: {
    canonical: process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com",
  },
  applicationName: "QR MASTER",
  authors: [{ name: "Master Digital" }],
  generator: "Master Digital SaaS Engine",
  keywords: [
    "QR Code",
    "QR Code Inteligente",
    "QR Code Dinâmico",
    "Gerador Pix",
    "Analytics QR Code",
    "SaaS QR Code",
    "QR MASTER",
    "Master Digital",
  ],
  creator: "Master Digital",
  publisher: "Master Digital",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/symbol.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "icon", url: "/brand/favicon-192.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", url: "/brand/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://qrmasterdigital.com",
    title: "QR MASTER — QR Codes Inteligentes",
    description: "Crie QR Codes personalizados e dinâmicos, gerencie seus links e acompanhe métricas de escaneamento.",
    siteName: "QR MASTER",
    images: [
      {
        url: "/brand/logo-horizontal-dark.png",
        width: 1200,
        height: 630,
        alt: "QR MASTER — Conecta o seu mundo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QR MASTER — QR Codes Inteligentes",
    description: "Crie QR Codes personalizados e dinâmicos, gerencie seus links e acompanhe métricas de escaneamento.",
    images: ["/brand/logo-horizontal-dark.png"],
    creator: "@masterdigital",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={poppins.variable} suppressHydrationWarning>
      <body className={`${poppins.className} min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased transition-colors duration-200`}>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
