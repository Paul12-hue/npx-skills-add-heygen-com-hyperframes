import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { hasRole, type Role } from "./domain";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./session";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

/** Aktueller Benutzer – Rolle wird bei jeder Anfrage frisch aus der DB gelesen (sofortiger Entzug möglich). */
export async function currentUser() {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!user || !user.active) return null;
  return user;
}

export async function requireRole(min: Role) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!hasRole(user.role, min)) redirect("/?fehler=keine-berechtigung");
  return user;
}

/** Für Route-Handler: liefert Benutzer oder null (kein Redirect). */
export async function userWithRole(min: Role) {
  const user = await currentUser();
  return user && hasRole(user.role, min) ? user : null;
}

export async function startSession(user: { id: string; role: string; username: string }) {
  const token = await signSession({ uid: user.id, role: user.role, name: user.username });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
