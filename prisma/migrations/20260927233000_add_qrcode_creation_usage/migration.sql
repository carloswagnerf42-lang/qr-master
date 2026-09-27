-- CreateTable
CREATE TABLE "QRCodeCreationUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qrCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRCodeCreationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QRCodeCreationUsage_userId_idx" ON "QRCodeCreationUsage"("userId");

-- CreateIndex
CREATE INDEX "QRCodeCreationUsage_userId_createdAt_idx" ON "QRCodeCreationUsage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QRCodeCreationUsage_createdAt_idx" ON "QRCodeCreationUsage"("createdAt");

-- AddForeignKey
ALTER TABLE "QRCodeCreationUsage" ADD CONSTRAINT "QRCodeCreationUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCodeCreationUsage" ADD CONSTRAINT "QRCodeCreationUsage_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Etapa 1: Inserir criações a partir de QRCode (ativos e lixeira) no ciclo atual de planos finitos (FREE e PRO)
WITH "UserCurrentCycles" AS (
  SELECT
    u."id" AS "userId",
    CASE
      -- Assinatura ativa (PRO)
      WHEN s."id" IS NOT NULL AND (
        s."status" = 'ACTIVE'
        OR (s."status" = 'PAST_DUE' AND s."currentPeriodEnd" + INTERVAL '5 days' > NOW())
        OR (s."status" = 'CANCELED' AND s."currentPeriodEnd" > NOW())
      ) THEN
        CASE
          WHEN s."currentPeriodEnd" - s."currentPeriodStart" > INTERVAL '60 days' THEN
            s."currentPeriodStart" + (
              LEAST(11, FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - s."currentPeriodStart")) / 86400) / 30)) * 30 * INTERVAL '1 day'
            )
          ELSE
            s."currentPeriodStart"
        END
      -- Usuário FREE (sem assinatura ativa)
      ELSE
        u."createdAt" + (
          FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - u."createdAt")) / 86400) / 30) * 30 * INTERVAL '1 day'
        )
    END AS "cycleStart"
  FROM "User" u
  LEFT JOIN "Subscription" s ON s."userId" = u."id"
  LEFT JOIN "Plan" p_sub ON p_sub."id" = s."planId"
  LEFT JOIN "Plan" p_user ON p_user."id" = u."planId"
  WHERE u."role" != 'ADMIN'
    AND COALESCE(p_sub."name", p_user."name", 'FREE') IN ('FREE', 'PRO')
)
INSERT INTO "QRCodeCreationUsage" ("id", "userId", "qrCodeId", "createdAt")
SELECT
  'bfill_qr_' || q."id" AS "id",
  q."userId",
  q."id" AS "qrCodeId",
  q."createdAt"
FROM "QRCode" q
INNER JOIN "UserCurrentCycles" c ON c."userId" = q."userId"
WHERE q."createdAt" >= c."cycleStart"
ON CONFLICT ("id") DO NOTHING;

-- Backfill Etapa 2: Inserir criações a partir de ActivityLog para QRs hard-deletados no ciclo atual com deduplicação por entityId
WITH "UserCurrentCycles" AS (
  SELECT
    u."id" AS "userId",
    CASE
      -- Assinatura ativa (PRO)
      WHEN s."id" IS NOT NULL AND (
        s."status" = 'ACTIVE'
        OR (s."status" = 'PAST_DUE' AND s."currentPeriodEnd" + INTERVAL '5 days' > NOW())
        OR (s."status" = 'CANCELED' AND s."currentPeriodEnd" > NOW())
      ) THEN
        CASE
          WHEN s."currentPeriodEnd" - s."currentPeriodStart" > INTERVAL '60 days' THEN
            s."currentPeriodStart" + (
              LEAST(11, FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - s."currentPeriodStart")) / 86400) / 30)) * 30 * INTERVAL '1 day'
            )
          ELSE
            s."currentPeriodStart"
        END
      -- Usuário FREE (sem assinatura ativa)
      ELSE
        u."createdAt" + (
          FLOOR(GREATEST(0, EXTRACT(EPOCH FROM (NOW() - u."createdAt")) / 86400) / 30) * 30 * INTERVAL '1 day'
        )
    END AS "cycleStart"
  FROM "User" u
  LEFT JOIN "Subscription" s ON s."userId" = u."id"
  LEFT JOIN "Plan" p_sub ON p_sub."id" = s."planId"
  LEFT JOIN "Plan" p_user ON p_user."id" = u."planId"
  WHERE u."role" != 'ADMIN'
    AND COALESCE(p_sub."name", p_user."name", 'FREE') IN ('FREE', 'PRO')
)
INSERT INTO "QRCodeCreationUsage" ("id", "userId", "qrCodeId", "createdAt")
SELECT
  'bfill_entity_' || a."entityId" AS "id",
  a."userId",
  NULL AS "qrCodeId",
  MIN(a."createdAt") AS "createdAt"
FROM "ActivityLog" a
INNER JOIN "UserCurrentCycles" c ON c."userId" = a."userId"
WHERE a."action" = 'CREATE_QR'
  AND a."entityId" IS NOT NULL
  AND a."createdAt" >= c."cycleStart"
  AND NOT EXISTS (
    SELECT 1 FROM "QRCode" q WHERE q."id" = a."entityId"
  )
GROUP BY a."userId", a."entityId"
ON CONFLICT ("id") DO NOTHING;
