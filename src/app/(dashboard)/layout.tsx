import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { QuotaProvider } from "@/contexts/QuotaContext";
import { getUserPlanAndUsage } from "@/lib/permissions";
import { GoogleAuthTracker } from "@/components/analytics/GoogleAuthTracker";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const userContext = await getUserPlanAndUsage(user.id);
  const planName = userContext?.plan?.name || "FREE";
  const maxQRCodes = userContext?.plan?.maxQRCodes ?? (planName === "PRO" ? 15 : 5);
  const usedQRCodes = userContext?.qrCodeCount ?? 0;
  const isUnlimited = Boolean(user.role === "ADMIN" || planName === "BUSINESS" || maxQRCodes > 9999);
  const canCreate = isUnlimited || usedQRCodes < maxQRCodes;

  const initialQuota = {
    planName,
    maxQRCodes,
    usedQRCodes,
    remainingQRCodes: Math.max(0, maxQRCodes - usedQRCodes),
    canCreate,
    isUnlimited,
    role: user.role,
  };

  return (
    <QuotaProvider initialQuota={initialQuota}>
      <GoogleAuthTracker />
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
        {/* Sidebar (Desktop Fixed + Mobile Retrátil) */}
        <Sidebar user={user} />

        {/* Main Content Area */}
        <div className="flex-1 md:pl-64 flex flex-col min-w-0">
          <main className="flex-1 pb-16">
            {children}
          </main>
        </div>
      </div>
    </QuotaProvider>
  );
}
