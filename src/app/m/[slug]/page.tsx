import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Globe, MessageCircle, Instagram, Youtube, ExternalLink, QrCode } from "lucide-react";
import { sanitizeMultiLinkLinks } from "@/lib/multilink";

export default async function MultiLinkPage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await prisma.multiLinkPage.findUnique({
    where: { slug: params.slug },
  });

  if (!page) {
    // If not found, return demo multi-link page preview
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm mx-auto text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 p-1 mx-auto shadow-xl">
            <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center font-extrabold text-3xl">
              QD
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold">Nexus Digital</h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Soluções inteligentes em marketing, design e tecnologia para o seu negócio.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="https://wa.me/5511999999999"
              target="_blank"
              rel="noreferrer"
              className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 backdrop-blur-md font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span>Fale Conosco no WhatsApp</span>
            </a>

            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 backdrop-blur-md font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              <Instagram className="w-4 h-4 text-pink-400" />
              <span>Siga no Instagram</span>
            </a>

            <a
              href="https://qrmaster.app"
              target="_blank"
              rel="noreferrer"
              className="w-full p-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02]"
            >
              <Globe className="w-4 h-4 text-white" />
              <span>Visite Nosso Site Oficial</span>
            </a>
          </div>

          <div className="pt-8 text-[11px] text-slate-500 flex items-center justify-center gap-1">
            <QrCode className="w-3.5 h-3.5" />
            <span>Página criada com QR MASTER</span>
          </div>
        </div>
      </div>
    );
  }

  let linksArray = [];
  try {
    linksArray = JSON.parse(page.links || "[]");
  } catch {
    linksArray = [];
  }

  const safeLinks = sanitizeMultiLinkLinks(linksArray);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white font-extrabold text-2xl mx-auto shadow-xl">
          {page.title[0]?.toUpperCase()}
        </div>

        <div>
          <h1 className="text-xl font-bold">{page.title}</h1>
          {page.bio && <p className="text-xs text-slate-400 mt-1">{page.bio}</p>}
        </div>

        <div className="space-y-3">
          {safeLinks.map((link, idx: number) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="w-full p-3.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 backdrop-blur-md font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
            >
              <span>{link.title}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          ))}
        </div>

        <div className="pt-8 text-[11px] text-slate-500 flex items-center justify-center gap-1">
          <QrCode className="w-3.5 h-3.5" />
          <span>Criado com QR MASTER</span>
        </div>
      </div>
    </div>
  );
}
