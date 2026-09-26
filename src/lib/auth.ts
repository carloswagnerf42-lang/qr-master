import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./db";

function getJwtSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CRITICAL SECURITY ERROR: AUTH_SECRET environment variable is missing in production.");
    }
    return "qr-master-dev-fallback-secret-key-only";
  }
  return secret;
}

const COOKIE_NAME = "qrmaster_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  planId?: string | null;
  sid?: string;
}

export interface ServerSessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  userExists?: boolean;
}

export interface SessionStoreAdapter {
  create(data: {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<ServerSessionRecord>;
  findUnique(id: string): Promise<ServerSessionRecord | null>;
  revokeById(id: string, revokedAt: Date): Promise<boolean>;
  revokeAllForUser(userId: string, revokedAt: Date, exceptSessionId?: string): Promise<number>;
}

const prismaSessionStore: SessionStoreAdapter = {
  async create(data) {
    return await prisma.session.create({ data });
  },
  async findUnique(id) {
    const rec = await prisma.session.findUnique({
      where: { id },
      include: { user: { select: { id: true } } },
    });
    if (!rec) return null;
    return {
      ...rec,
      userExists: Boolean(rec.user?.id),
    };
  },
  async revokeById(id, revokedAt) {
    const res = await prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
    return res.count > 0;
  },
  async revokeAllForUser(userId, revokedAt, exceptSessionId) {
    const res = await prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt },
    });
    return res.count;
  },
};

let activeSessionStore: SessionStoreAdapter = prismaSessionStore;

/**
 * Permite injetar um SessionStore isolado exclusivamente em suítes de testes automatizados
 * para evitar escrita no banco de dados de produção.
 */
export function setSessionStoreForTesting(store: SessionStoreAdapter | null) {
  activeSessionStore = store ?? prismaSessionStore;
}

/**
 * Gera um identificador de sessão criptograficamente seguro (CSPRNG UUID v4).
 */
export function generateSessionId(): string {
  return crypto.randomUUID();
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Hash bcrypt constante válido com cost factor 10 (idêntico ao utilizado por hashPassword).
 * Utilizado para mitigar timing attacks e prevenir enumeração de contas por tempo de resposta,
 * garantindo que requisições com usuário inexistente ou sem passwordHash executem o mesmo
 * trabalho criptográfico (bcrypt.compare) que contas com senha incorreta.
 */
export const DUMMY_PASSWORD_HASH =
  "$2a$10$TohEevee4AQ6PZfpPP2jv.OVnlBpDBfNQ8.u3MgBf2gOCIkce4sE6";

export async function verifyPassword(password: string, hash?: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Gera um token criptográfico seguro de 32 bytes (64 caracteres hexadecimais)
 * e o hash SHA-256 para armazenamento persistente no banco de dados.
 */
export function generateSecureToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Calcula o hash SHA-256 de um token para comparação segura.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function signToken(user: SessionUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planId: user.planId,
      ...(user.sid ? { sid: user.sid } : {}),
    },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): SessionUser | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as SessionUser;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Cria uma sessão persistente no banco de dados (Server-Side Session).
 * Comportamento Fail-Closed: propaga erro caso a gravação no banco falhe.
 */
export async function createServerSession(
  params: {
    userId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    ttlMs?: number;
  },
  store: SessionStoreAdapter = activeSessionStore
): Promise<{ id: string; userId: string; expiresAt: Date }> {
  if (!params.userId || typeof params.userId !== "string" || !params.userId.trim()) {
    throw new Error("Invalid userId for server session creation.");
  }

  const id = generateSessionId();
  const ttlMs = params.ttlMs ?? SESSION_TTL_MS;
  const expiresAt = new Date(Date.now() + ttlMs);
  const safeUserAgent = params.userAgent ? String(params.userAgent).slice(0, 512) : null;
  const safeIpAddress = params.ipAddress ? String(params.ipAddress).slice(0, 128) : null;

  const record = await store.create({
    id,
    userId: params.userId.trim(),
    expiresAt,
    revokedAt: null,
    userAgent: safeUserAgent,
    ipAddress: safeIpAddress,
  });

  return {
    id: record.id,
    userId: record.userId,
    expiresAt: record.expiresAt,
  };
}

/**
 * Cria a sessão server-side e assina o JWT correspondente vinculado por `sid`.
 * Se a criação da sessão no banco falhar, nenhum JWT é emitido (Fail-Closed).
 */
export async function createAuthenticatedSessionToken(
  user: Omit<SessionUser, "sid">,
  metadata?: { userAgent?: string | null; ipAddress?: string | null; ttlMs?: number },
  store: SessionStoreAdapter = activeSessionStore
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const session = await createServerSession(
    {
      userId: user.id,
      userAgent: metadata?.userAgent,
      ipAddress: metadata?.ipAddress,
      ttlMs: metadata?.ttlMs,
    },
    store
  );

  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    planId: user.planId,
    sid: session.id,
  });

  return {
    token,
    sessionId: session.id,
    expiresAt: session.expiresAt,
  };
}

/**
 * Valida o vínculo entre o payload JWT decodificado e o registro Session no servidor.
 * Verifica estritamente (Fail-Closed):
 * 1. Presença de `sid` (tokens legados sem sid são rejeitados)
 * 2. Existência da Session no banco
 * 3. Correspondência de ownership (Session.userId === decoded.id)
 * 4. Ausência de revogação (Session.revokedAt === null)
 * 5. Vigência temporal (Session.expiresAt > now)
 */
export async function validateServerSession(
  decoded: SessionUser | null,
  options?: { store?: SessionStoreAdapter; now?: Date }
): Promise<SessionUser | null> {
  if (!decoded || !decoded.id || typeof decoded.id !== "string") {
    return null;
  }

  if (!decoded.sid || typeof decoded.sid !== "string" || !decoded.sid.trim()) {
    return null;
  }

  const store = options?.store ?? activeSessionStore;
  const now = options?.now ?? new Date();

  try {
    const session = await store.findUnique(decoded.sid.trim());
    if (!session) {
      return null;
    }

    if (session.userId !== decoded.id) {
      return null;
    }

    if (session.userExists === false) {
      return null;
    }

    if (session.revokedAt !== null && session.revokedAt !== undefined) {
      return null;
    }

    const expiresAtTime =
      session.expiresAt instanceof Date
        ? session.expiresAt.getTime()
        : new Date(session.expiresAt).getTime();

    if (isNaN(expiresAtTime) || expiresAtTime <= now.getTime()) {
      return null;
    }

    return decoded;
  } catch {
    // Qualquer falha de consulta ao banco opera em modo Fail-Closed
    return null;
  }
}

/**
 * Revoga uma sessão específica pelo seu `sid` (preenche revokedAt).
 */
export async function revokeServerSession(
  sid?: string | null,
  store: SessionStoreAdapter = activeSessionStore
): Promise<boolean> {
  if (!sid || typeof sid !== "string" || !sid.trim()) {
    return false;
  }
  try {
    return await store.revokeById(sid.trim(), new Date());
  } catch {
    return false;
  }
}

/**
 * Revoga todas as sessões ativas de um usuário (opcionalmente preservando uma sessão atual).
 */
export async function revokeAllUserSessions(
  userId: string,
  options?: { exceptSessionId?: string; store?: SessionStoreAdapter }
): Promise<number> {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    return 0;
  }
  const store = options?.store ?? activeSessionStore;
  return await store.revokeAllForUser(userId.trim(), new Date(), options?.exceptSessionId);
}

/**
 * Extrai o token bruto da requisição ou do cookieStore do Next.js.
 */
export function extractTokenFromRequest(req?: Request | NextRequest): string | null {
  try {
    if (req) {
      if ("cookies" in req && typeof (req as any).cookies?.get === "function") {
        const token = (req as any).cookies.get(COOKIE_NAME)?.value;
        if (token) return token;
      }
      const cookieHeader = req.headers?.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
        if (match && match[1]) {
          return decodeURIComponent(match[1]);
        }
      }
      const authHeader = req.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
      }
    }

    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    return token || null;
  } catch {
    return null;
  }
}

export async function getSession(req?: Request | NextRequest): Promise<SessionUser | null> {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded) return null;

    return await validateServerSession(decoded);
  } catch {
    return null;
  }
}

export async function getCurrentUser(req?: Request | NextRequest) {
  const session = await getSession(req);
  if (!session) return null;

  try {
    return await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        phone: true,
        avatarUrl: true,
        planId: true,
        createdAt: true,
        settings: true,
        plan: true,
        subscription: true,
      },
    });
  } catch {
    return null;
  }
}

export function getSessionCookieOptions(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return {
    httpOnly: true as const,
    secure: nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, getSessionCookieOptions());
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
}
