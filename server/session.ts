import { createHmac, timingSafeEqual } from "crypto";

// Redis 세션 대신 서명된 쿠키에 로그인 정보를 담음.
// Vercel 함수는 요청마다 다른 인스턴스에서 실행될 수 있어 서버 메모리에 세션을 둘 수 없고,
// 서명(HMAC)이 있어 사용자가 쿠키 내용(userId 등)을 바꾸면 검증에 실패함
export interface Session {
  userId: number;
  loginId: string;
  username: string | null;
}

const COOKIE = "clothes_session";
// Spring Session 기본값과 같은 30분 (마지막 요청 기준으로 연장됨)
const MAX_AGE_SEC = 30 * 60;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  return "local-dev-only-secret";
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function sessionCookie(s: Session, secure: boolean) {
  const payload = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + MAX_AGE_SEC * 1000 })).toString("base64url");
  return serialize(`${payload}.${sign(payload)}`, MAX_AGE_SEC, secure);
}

export function clearSessionCookie(secure: boolean) {
  return serialize("", 0, secure);
}

function serialize(value: string, maxAge: number, secure: boolean) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readSession(cookieHeader: string | undefined): Session | null {
  const raw = cookieHeader?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload)), actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { userId, loginId, username, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp < Date.now()) return null;
    return { userId, loginId, username };
  } catch {
    return null;
  }
}
