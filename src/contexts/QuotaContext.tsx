"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { UpgradeModal, UpgradeReason } from "@/components/UpgradeModal";
import { evalQuotaCanCreate, QuotaGateDecision } from "@/lib/quota-gate";

export interface InitialQuotaData {
  planName: string;
  maxQRCodes: number;
  usedQRCodes: number;
  remainingQRCodes: number;
  canCreate: boolean;
  isUnlimited: boolean;
  role?: string;
}

export interface QuotaContextType {
  planName: string;
  maxQRCodes: number;
  usedQRCodes: number;
  remainingQRCodes: number;
  canCreate: boolean;
  isUnlimited: boolean;
  loading: boolean;
  requireCreationQuota: (e?: React.SyntheticEvent) => boolean;
  openUpgradeModal: (reason?: UpgradeReason, customLimit?: number) => void;
  closeUpgradeModal: () => void;
  refreshQuota: () => Promise<void>;
  decision: QuotaGateDecision;
}

const QuotaContext = createContext<QuotaContextType | undefined>(undefined);

export function QuotaProvider({
  children,
  initialQuota,
}: {
  children: React.ReactNode;
  initialQuota?: InitialQuotaData;
}) {
  const [quotaData, setQuotaData] = useState<InitialQuotaData>(() => {
    if (initialQuota) return initialQuota;
    return {
      planName: "FREE",
      maxQRCodes: 5,
      usedQRCodes: 0,
      remainingQRCodes: 5,
      canCreate: true,
      isUnlimited: false,
    };
  });

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReason, setModalReason] = useState<UpgradeReason>("LIMIT_REACHED");
  const [modalLimit, setModalLimit] = useState<number>(5);

  const decision = useMemo<QuotaGateDecision>(() => {
    return evalQuotaCanCreate(
      { name: quotaData.planName, maxQRCodes: quotaData.maxQRCodes },
      quotaData.usedQRCodes,
      quotaData.role
    );
  }, [quotaData]);

  const refreshQuota = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          const planName = data.plan?.name || "FREE";
          const maxQRCodes = data.usage?.maxQRCodes ?? (planName === "PRO" ? 15 : 5);
          const usedQRCodes = data.usage?.qrCodes ?? 0;
          const remainingQRCodes = data.usage?.remainingQRCodes ?? Math.max(0, maxQRCodes - usedQRCodes);
          const role = data.user.role;
          const isUnlimited = Boolean(role === "ADMIN" || planName === "BUSINESS" || maxQRCodes > 9999);
          const canCreate = data.permissions?.create_qr ?? (isUnlimited || usedQRCodes < maxQRCodes);

          setQuotaData({
            planName,
            maxQRCodes,
            usedQRCodes,
            remainingQRCodes,
            canCreate,
            isUnlimited,
            role,
          });
        }
      }
    } catch (err) {
      console.error("[QuotaContext] Falha ao atualizar cota:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza a cota ao voltar foco na janela
  useEffect(() => {
    const handleFocus = () => refreshQuota();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshQuota]);

  const openUpgradeModal = useCallback((reason: UpgradeReason = "LIMIT_REACHED", customLimit?: number) => {
    setModalReason(reason);
    setModalLimit(customLimit || decision.limit || 5);
    setModalOpen(true);
  }, [decision.limit]);

  const closeUpgradeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  /**
   * Gate preventiva para CTAs de criação:
   * Se houver cota: retorna true permitindo prosseguir.
   * Se cota estiver esgotada: previne navegação, abre UpgradeModal e retorna false.
   */
  const requireCreationQuota = useCallback((e?: React.SyntheticEvent): boolean => {
    if (!decision.canCreate) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      openUpgradeModal("LIMIT_REACHED", decision.limit);
      return false;
    }
    return true;
  }, [decision.canCreate, decision.limit, openUpgradeModal]);

  const value = useMemo<QuotaContextType>(() => ({
    planName: decision.currentPlan,
    maxQRCodes: decision.limit,
    usedQRCodes: decision.current,
    remainingQRCodes: decision.remaining,
    canCreate: decision.canCreate,
    isUnlimited: decision.isUnlimited,
    loading,
    requireCreationQuota,
    openUpgradeModal,
    closeUpgradeModal,
    refreshQuota,
    decision,
  }), [decision, loading, requireCreationQuota, openUpgradeModal, closeUpgradeModal, refreshQuota]);

  return (
    <QuotaContext.Provider value={value}>
      {children}
      <UpgradeModal
        isOpen={modalOpen}
        onClose={closeUpgradeModal}
        reason={modalReason}
        limit={modalLimit}
        currentPlan={decision.currentPlan}
        requiredPlan={decision.requiredPlan || (decision.currentPlan === "PRO" ? "BUSINESS" : "PRO")}
      />
    </QuotaContext.Provider>
  );
}

export function useQuota(): QuotaContextType {
  const context = useContext(QuotaContext);
  if (!context) {
    // Fallback gracioso caso utilizado fora de QuotaProvider
    const fallbackDecision = evalQuotaCanCreate({ name: "FREE", maxQRCodes: 5 }, 0);
    return {
      planName: "FREE",
      maxQRCodes: 5,
      usedQRCodes: 0,
      remainingQRCodes: 5,
      canCreate: true,
      isUnlimited: false,
      loading: false,
      requireCreationQuota: () => true,
      openUpgradeModal: () => {},
      closeUpgradeModal: () => {},
      refreshQuota: async () => {},
      decision: fallbackDecision,
    };
  }
  return context;
}
