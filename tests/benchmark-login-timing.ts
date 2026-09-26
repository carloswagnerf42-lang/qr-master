/**
 * SECURITY-AUTH-08D: Suíte de Benchmark de Timing da Rota de Login
 *
 * Mede com alta precisão (performance.now) a latência de processamento
 * nos seguintes cenários:
 * A. Usuário inexistente
 * B. Conta tradicional com senha incorreta (executa bcrypt.compare)
 * C. Conta Google-only (passwordHash === null)
 * D. Login válido com credenciais corretas (referência)
 *
 * Utiliza 100 amostras por cenário precedidas de warm-up.
 */

export {};

const asyncHooks = require("async_hooks");
(globalThis as any).AsyncLocalStorage = asyncHooks.AsyncLocalStorage;

const { requestAsyncStorage } = require("next/dist/client/components/request-async-storage.external");
const { RequestCookies } = require("next/dist/compiled/@edge-runtime/cookies");
const { NextRequest } = require("next/server");
const { performance } = require("perf_hooks");
const { prisma } = require("../src/lib/db");
const { hashPassword } = require("../src/lib/auth");
const { resetRateLimit } = require("../src/lib/rate-limit");
const { POST } = require("../src/app/api/auth/login/route") as {
  POST: (req: any) => Promise<{ status: number; json: () => Promise<any> }>;
};

interface TimingStats {
  samples: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p95: number;
  stdDev: number;
  raw: number[];
}

function calculateStats(values: number[]): TimingStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;

  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p50 = median;
  const p95Index = Math.min(Math.floor(n * 0.95), n - 1);
  const p95 = sorted[p95Index];

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    samples: n,
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    median: Number(median.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    raw: sorted,
  };
}

async function executeInRequestContext<T>(fn: () => Promise<T>): Promise<T> {
  const headers = new Headers();
  const mutableCookies = new RequestCookies(headers);
  return requestAsyncStorage.run(
    { mutableCookies, cookies: mutableCookies },
    fn
  );
}

export async function runBenchmark(iterations = 100, warmupIterations = 10) {
  console.log("================================================================");
  console.log("⏱️ SECURITY-AUTH-08D: BENCHMARK CONTROLADO DE TIMING NO LOGIN");
  console.log("================================================================\n");

  const timestamp = Date.now();
  const testPassword = "BenchmarkTestPassword123!";
  const testWrongPassword = "CompletelyWrongBenchmarkPassword999!";

  const traditionalEmail = `bench_trad_${timestamp}@test.local`;
  const googleEmail = `bench_google_${timestamp}@test.local`;
  const nonexistentEmail = `bench_nonexistent_${timestamp}@test.local`;

  let traditionalUserId: string | null = null;
  let googleUserId: string | null = null;

  try {
    // 1. Setup de dados de teste isolados
    console.log("▶ Configurando fixtures de teste...");
    const hashedPassword = await hashPassword(testPassword);

    const traditionalUser = await prisma.user.create({
      data: {
        name: "Benchmark Traditional User",
        email: traditionalEmail,
        passwordHash: hashedPassword,
        role: "USER",
      },
    });
    traditionalUserId = traditionalUser.id;

    const googleUser = await prisma.user.create({
      data: {
        name: "Benchmark Google User",
        email: googleEmail,
        passwordHash: null,
        role: "USER",
      },
    });
    googleUserId = googleUser.id;

    console.log(`  ✓ Usuário tradicional criado (id: ${traditionalUserId})`);
    console.log(`  ✓ Usuário Google-only criado (id: ${googleUserId}, passwordHash: null)\n`);

    // Helper de requisição
    async function measureLogin(email: string, pass: string, ip: string): Promise<number> {
      await resetRateLimit(ip, "login");
      const req = new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
          "user-agent": "TimingBenchmark/1.0",
        },
        body: JSON.stringify({ email, password: pass }),
      });

      const t0 = performance.now();
      const res = await executeInRequestContext(() => POST(req));
      await res.json();
      const t1 = performance.now();
      return t1 - t0;
    }

    // 2. Warm-up
    console.log(`▶ Executando warm-up (${warmupIterations} iterações)...`);
    for (let i = 0; i < warmupIterations; i++) {
      const ip = `10.0.0.${(i % 250) + 1}`;
      await measureLogin(nonexistentEmail, testWrongPassword, ip);
      await measureLogin(traditionalEmail, testWrongPassword, ip);
      await measureLogin(googleEmail, testWrongPassword, ip);
      await measureLogin(traditionalEmail, testPassword, ip);
    }
    console.log("  ✓ Warm-up concluído.\n");

    // 3. Medições oficiais
    console.log(`▶ Coletando ${iterations} amostras para cada cenário...`);

    const timesNonexistent: number[] = [];
    const timesWrongPassword: number[] = [];
    const timesGoogleOnly: number[] = [];
    const timesValidLogin: number[] = [];

    // Intercalamos as execuções para mitigar bias de cache ou CPU throttling gradual
    for (let i = 0; i < iterations; i++) {
      const ipBase = `10.10.${(i % 200) + 1}`;

      // A. Usuário Inexistente
      const tA = await measureLogin(nonexistentEmail, testWrongPassword, `${ipBase}.1`);
      timesNonexistent.push(tA);

      // B. Senha Incorreta (usuário existente com passwordHash)
      const tB = await measureLogin(traditionalEmail, testWrongPassword, `${ipBase}.2`);
      timesWrongPassword.push(tB);

      // C. Google-only (usuário existente sem passwordHash)
      const tC = await measureLogin(googleEmail, testWrongPassword, `${ipBase}.3`);
      timesGoogleOnly.push(tC);

      // D. Login Válido (referência com credenciais corretas)
      const tD = await measureLogin(traditionalEmail, testPassword, `${ipBase}.4`);
      timesValidLogin.push(tD);

      if ((i + 1) % 25 === 0) {
        console.log(`  Progresso: ${i + 1}/${iterations} amostras coletadas...`);
      }
    }

    // 4. Cálculo estatístico
    const statsA = calculateStats(timesNonexistent);
    const statsB = calculateStats(timesWrongPassword);
    const statsC = calculateStats(timesGoogleOnly);
    const statsD = calculateStats(timesValidLogin);

    console.log("\n================================================================");
    console.log("📊 RESULTADOS ESTATÍSTICOS DO BENCHMARK (ms)");
    console.log("================================================================");

    console.log(`\nCENÁRIO A: Usuário Inexistente (${statsA.samples} amostras)`);
    console.log(`  Média:    ${statsA.mean} ms`);
    console.log(`  Mediana:  ${statsA.median} ms`);
    console.log(`  Mín/Máx:  ${statsA.min} ms / ${statsA.max} ms`);
    console.log(`  P95:      ${statsA.p95} ms`);
    console.log(`  Desv.Padr:${statsA.stdDev} ms`);

    console.log(`\nCENÁRIO B: Usuário Existente + Senha Incorreta (${statsB.samples} amostras)`);
    console.log(`  Média:    ${statsB.mean} ms`);
    console.log(`  Mediana:  ${statsB.median} ms`);
    console.log(`  Mín/Máx:  ${statsB.min} ms / ${statsB.max} ms`);
    console.log(`  P95:      ${statsB.p95} ms`);
    console.log(`  Desv.Padr:${statsB.stdDev} ms`);

    console.log(`\nCENÁRIO C: Usuário Google-only (passwordHash === null) (${statsC.samples} amostras)`);
    console.log(`  Média:    ${statsC.mean} ms`);
    console.log(`  Mediana:  ${statsC.median} ms`);
    console.log(`  Mín/Máx:  ${statsC.min} ms / ${statsC.max} ms`);
    console.log(`  P95:      ${statsC.p95} ms`);
    console.log(`  Desv.Padr:${statsC.stdDev} ms`);

    console.log(`\nCENÁRIO D: Login Válido (Referência) (${statsD.samples} amostras)`);
    console.log(`  Média:    ${statsD.mean} ms`);
    console.log(`  Mediana:  ${statsD.median} ms`);
    console.log(`  Mín/Máx:  ${statsD.min} ms / ${statsD.max} ms`);
    console.log(`  P95:      ${statsD.p95} ms`);
    console.log(`  Desv.Padr:${statsD.stdDev} ms`);

    // Comparações relativas
    const diffMedianaB_A = statsB.median - statsA.median;
    const ratioB_A = statsA.median > 0 ? (statsB.median / statsA.median).toFixed(1) : "N/A";

    const diffMedianaB_C = statsB.median - statsC.median;
    const ratioB_C = statsC.median > 0 ? (statsB.median / statsC.median).toFixed(1) : "N/A";

    const diffMedianaA_C = Math.abs(statsA.median - statsC.median);

    console.log("\n----------------------------------------------------------------");
    console.log("🔍 ANÁLISE COMPARATIVA DE TIMING:");
    console.log("----------------------------------------------------------------");
    console.log(`  Diferença de Mediana (Senha Incorreta B vs Inexistente A): +${diffMedianaB_A.toFixed(2)} ms (${ratioB_A}x mais lento)`);
    console.log(`  Diferença de Mediana (Senha Incorreta B vs Google-only A):  +${diffMedianaB_C.toFixed(2)} ms (${ratioB_C}x mais lento)`);
    console.log(`  Diferença de Mediana entre Inexistente A e Google-only C:   ${diffMedianaA_C.toFixed(2)} ms`);
    console.log("================================================================\n");

    return { statsA, statsB, statsC, statsD };
  } finally {
    // Limpeza rigorosa
    console.log("▶ Limpando dados do benchmark...");
    try {
      const idsToClean = [traditionalUserId, googleUserId].filter(Boolean) as string[];
      if (idsToClean.length > 0) {
        await prisma.activityLog.deleteMany({ where: { userId: { in: idsToClean } } });
        await prisma.session.deleteMany({ where: { userId: { in: idsToClean } } });
        await prisma.user.deleteMany({ where: { id: { in: idsToClean } } });
      }
      console.log("  ✓ Limpeza concluída.");
    } catch (e) {
      console.error("  Erro ao limpar fixtures:", e);
    } finally {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  runBenchmark(100, 10).catch((err) => {
    console.error("Falha no benchmark:", err);
    process.exit(1);
  });
}
