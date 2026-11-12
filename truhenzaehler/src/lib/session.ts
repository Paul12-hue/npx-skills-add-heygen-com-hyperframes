// Edge-taugliche Sitzungstoken (auch in middleware.ts nutzbar).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tz_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage

export interface SessionPayload {
  uid: string;
  role: string;
  name: string;
}

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET fehlt oder ist kürzer als 32 Zeichen");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload) {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { uid: String(payload.uid), role: String(payload.role), name: String(payload.name) };
  } catch {
    return null;
  }
}
