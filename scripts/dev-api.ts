// 로컬 개발용 API 서버 (Vercel에 배포할 때는 쓰이지 않음).
// api/ 폴더의 Vercel 함수들을 그대로 불러와 Vercel과 같은 방식(req.body, req.query)으로 호출함.
// `npm run dev`로 React 개발 서버(3000)와 함께 실행되며, package.json의 "proxy"로 /api 요청이 여기(3001)로 전달됨
import http from "http";
import type { NodeReq } from "../server/http";
import { setLocalDb } from "../server/db";
import { createLocalDb } from "./local-db";

import login from "../api/login/index";
import loginCheck from "../api/login/check";
import logout from "../api/login/logout";
import register from "../api/login/register";
import body from "../api/bodycheck/body";
import cloth from "../api/bodycheck/cloth";
import pants from "../api/bodycheck/pants";
import fitguide from "../api/bodycheck/fitguide";
import allstats from "../api/bodycheck/allstats/[userId]";

type Fn = (req: NodeReq, res: http.ServerResponse) => Promise<void>;

// Vercel의 파일 경로 기반 라우팅과 같은 규칙 ([userId] → 동적 경로 값)
const routes: [RegExp, Fn, string[]][] = [
  [/^\/api\/login$/, login, []],
  [/^\/api\/login\/check$/, loginCheck, []],
  [/^\/api\/login\/logout$/, logout, []],
  [/^\/api\/login\/register$/, register, []],
  [/^\/api\/bodycheck\/body$/, body, []],
  [/^\/api\/bodycheck\/cloth$/, cloth, []],
  [/^\/api\/bodycheck\/pants$/, pants, []],
  [/^\/api\/bodycheck\/fitguide$/, fitguide, []],
  [/^\/api\/bodycheck\/allstats\/([^/]+)$/, allstats, ["userId"]],
];

const PORT = Number(process.env.API_PORT || 3001);
const useFileDb = !process.env.DATABASE_URL && !process.env.POSTGRES_URL;
if (useFileDb) setLocalDb(createLocalDb);

http.createServer(async (req: NodeReq, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const match = routes.map(([re, fn, names]) => ({ m: re.exec(url.pathname), fn, names })).find((r) => r.m);
  if (!match) { res.statusCode = 404; res.end("Not Found"); return; }

  const query: Record<string, string> = Object.fromEntries(url.searchParams);
  match.names.forEach((name, i) => { query[name] = decodeURIComponent(match.m![i + 1]); });
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  req.body = Buffer.concat(chunks).toString("utf8");
  req.query = query;

  await match.fn(req, res);
  console.log(`${req.method} ${url.pathname} → ${res.statusCode}`);
}).listen(PORT, () => {
  console.log(`API 개발 서버: http://localhost:${PORT} (DB: ${useFileDb ? ".data/pglite 로컬 파일" : "DATABASE_URL"})`);
});
