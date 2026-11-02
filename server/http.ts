import type { IncomingMessage, ServerResponse } from "http";
import { readSession, sessionCookie, type Session } from "./session";
import { InvalidInput } from "./models";

// Vercel 함수와 로컬 개발 서버(scripts/dev-api.ts)가 공통으로 쓰는 요청/응답 형태.
// Vercel은 req.body(JSON 파싱 결과)와 req.query(쿼리 + [동적] 경로 값)를 채워서 넘겨주고,
// 로컬 개발 서버도 같은 방식으로 채워서 호출함
export type NodeReq = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

export interface ApiRequest {
  body: any;
  query: Record<string, string | string[]>;
  session: Session | null;
  secure: boolean;
}

export interface ApiResult {
  status?: number;
  json?: unknown;
  text?: string;
  cookies?: string[];
}

type Handler = (req: ApiRequest) => Promise<ApiResult>;
type Method = "GET" | "POST" | "PUT" | "DELETE";

export const ok = (json: unknown): ApiResult => ({ json });
export const text = (status: number, body: string): ApiResult => ({ status, text: body });
export const badRequest = (errors: Record<string, string>): ApiResult => ({ status: 400, json: errors });

/**
 * 로그인한 본인의 데이터만 읽고 쓸 수 있게 함.
 * (Java 버전은 요청에 담긴 userId를 그대로 믿어서, 공개 서버에 올리면 남의 치수를 조회·수정할 수 있었음)
 */
export function denyUnlessOwner(req: ApiRequest, userId: number | null): ApiResult | null {
  if (!req.session) return text(401, "로그인 정보가 없습니다.");
  if (userId !== null && userId !== req.session.userId) return text(403, "본인의 데이터만 접근할 수 있습니다.");
  return null;
}

/** 메서드별 핸들러를 Vercel 함수(default export)로 감쌈 */
export function route(handlers: Partial<Record<Method, Handler>>) {
  return async (req: NodeReq, res: ServerResponse) => {
    const handler = handlers[(req.method || "GET") as Method];
    if (!handler) return send(res, { status: 405, text: "Method Not Allowed" });

    const secure = isSecure(req);
    let rawBody: unknown;
    // Vercel은 req.body에 처음 접근할 때 JSON을 파싱하며, 깨진 JSON이면 여기서 예외를 던짐
    try { rawBody = req.body; } catch { return send(res, { status: 400, text: "잘못된 요청 형식입니다." }); }
    try {
      const session = readSession(req.headers.cookie);
      const result = await handler({ body: parseBody(rawBody), query: req.query || {}, session, secure });
      // 요청이 올 때마다 세션 만료 시간을 연장 (Spring Session처럼 마지막 활동 기준 30분 유지).
      // 핸들러가 직접 쿠키를 지정한 경우(로그인/로그아웃)는 그 값을 그대로 사용
      if (session && !result.cookies) result.cookies = [sessionCookie(session, secure)];
      send(res, result);
    } catch (e) {
      // JSON 자체가 깨졌거나 숫자 자리에 숫자가 아닌 값이 온 경우 (Java의 HttpMessageNotReadableException → 400)
      if (e instanceof BadJsonError || e instanceof InvalidInput) return send(res, { status: 400, text: "잘못된 요청 형식입니다." });
      console.error(e);
      send(res, { status: 500, text: "서버 내부 오류가 발생했습니다." });
    }
  };
}

class BadJsonError extends Error {}

function parseBody(body: unknown) {
  if (typeof body !== "string") return body ?? null;
  if (body === "") return null;
  try { return JSON.parse(body); } catch { throw new BadJsonError(); }
}

function isSecure(req: NodeReq) {
  return req.headers["x-forwarded-proto"] === "https" || !!process.env.VERCEL;
}

function send(res: ServerResponse, { status = 200, json, text: body, cookies }: ApiResult) {
  res.statusCode = status;
  if (cookies) res.setHeader("Set-Cookie", cookies);
  res.setHeader("Cache-Control", "no-store");
  if (body !== undefined) {
    res.setHeader("Content-Type", "text/plain;charset=UTF-8");
    res.end(body);
  } else {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(json ?? null));
  }
}
