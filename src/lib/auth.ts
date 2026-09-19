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

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  planId?: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: SessionUser): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      planId: user.planId,
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

export async function getSession(req?: Request | NextRequest): Promise<SessionUser | null> {
  try {
    // 1. Prioritize cookie/token directly from request if passed
    if (req) {
      if ("cookies" in req && typeof (req as any).cookies?.get === "function") {
        const token = (req as any).cookies.get(COOKIE_NAME)?.value;
        if (token) {
          const verified = verifyToken(token);
          if (verified) return verified;
        }
      }
      const cookieHeader = req.headers?.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
        if (match && match[1]) {
          const verified = verifyToken(decodeURIComponent(match[1]));
          if (verified) return verified;
        }
      }
      const authHeader = req.headers?.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const verified = verifyToken(authHeader.substring(7));
        if (verified) return verified;
      }
    }

    // 2. Fall back to Next.js cookies() store
    const cookieStore = cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
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

export function setSessionCookie(token: string) {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie() {
  const cookieStore = cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
