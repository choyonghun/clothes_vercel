import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA, setLocalDb, getDb } from "./db";
import { sessionCookie } from "./session";
import { saveUser, findUserByLoginId } from "./repository";
import { buildThreads, isAdmin } from "./wishlist";
import handler from "../api/wishlist/index";
import register from "../api/login/register";

/**
 * "개발자한테 바라는 목록" API를 메모리 DB(PGlite)로 끝까지 호출해 봄.
 * 테이블은 SCHEMA가 자동으로 만들고, 핸들러는 Vercel이 부르는 것과 같은 형태(req, res)로 호출
 */
setLocalDb(async () => {
  const pg = new PGlite();
  await pg.exec(SCHEMA);
  // 이미 테이블이 있는 DB에서 다시 실행해도 오류가 없어야 함 (서버가 뜰 때마다 실행되므로)
  await pg.exec(SCHEMA);
  return { query: async (sql, params) => (await pg.query<any>(sql, params)).rows };
});

async function login(loginId: string, username: string | null) {
  if (!(await findUserByLoginId(loginId))) await saveUser({ loginId, password: "x", username });
  const u = (await findUserByLoginId(loginId))!;
  return sessionCookie({ userId: u.userId!, loginId, username }, false).split(";")[0];
}

async function call(method: string, cookie: string | null, opts: { body?: unknown; query?: Record<string, string> } = {}, fn: any = handler) {
  const req: any = { method, headers: cookie ? { cookie } : {}, body: opts.body === undefined ? "" : JSON.stringify(opts.body), query: opts.query || {} };
  let status = 200, out = "";
  const res: any = { setHeader() {}, end(b: string) { out = b; }, set statusCode(v: number) { status = v; }, get statusCode() { return status; } };
  await fn(req, res);
  let json: any = null;
  try { json = JSON.parse(out); } catch { json = out; }
  return { status, json };
}

const findIn = (list: any, id: number): any =>
  list.comments.flatMap((c: any) => [c, ...c.replies]).find((c: any) => c.id === id);

test("테이블 자동 생성", async () => {
  const db = await getDb();
  const [r] = await db.query("SELECT to_regclass('wish_comment') AS t");
  assert.equal(r.t, "wish_comment");
});

test("로그인하지 않으면 보기·쓰기·수정·삭제 모두 401", async () => {
  assert.equal((await call("GET", null)).status, 401);
  assert.equal((await call("POST", null, { body: { content: "hi" } })).status, 401);
  assert.equal((await call("PUT", null, { query: { id: "1" }, body: { content: "hi" } })).status, 401);
  assert.equal((await call("DELETE", null, { query: { id: "1" } })).status, 401);
});

test("댓글은 익명으로 표시되고 이름·아이디가 응답에 없음", async () => {
  const a = await login("alice", "앨리스");
  const b = await login("bob", "밥");
  const r = await call("POST", a, { body: { content: "  치마 길이도 저장되면 좋겠어요  " } });
  assert.equal(r.status, 200);
  const mineView = r.json.comments[0];
  assert.equal(mineView.content, "치마 길이도 저장되면 좋겠어요"); // 앞뒤 공백 제거
  assert.equal(mineView.author, "익명");
  assert.equal(mineView.mine, true);

  const other = await call("GET", b);
  const seen = findIn(other.json, mineView.id);
  assert.equal(seen.author, "익명");
  assert.equal(seen.mine, false);
  const raw = JSON.stringify(other.json);
  for (const leak of ["alice", "앨리스", "userId"]) assert.ok(!raw.includes(leak), `응답에 ${leak} 노출`);
});

test("답글 순서와 1단계 깊이", async () => {
  const a = await login("alice", "앨리스");
  const b = await login("bob", "밥");
  const first = (await call("POST", a, { body: { content: "원댓글" } })).json.comments[0].id;
  await call("POST", b, { body: { content: "다른 원댓글" } });
  const reply = await call("POST", b, { body: { content: "저도요", parentId: first } });
  const replyId = findIn(reply.json, first).replies[0].id;
  const nested = await call("POST", a, { body: { content: "감사합니다", parentId: replyId } }); // 답글의 답글

  assert.equal(nested.json.comments[0].content, "다른 원댓글"); // 원댓글은 최신순
  assert.deepEqual(findIn(nested.json, first).replies.map((r: any) => r.content), ["저도요", "감사합니다"]);
});

test("수정: 본인만, 수정됨 표시", async () => {
  const a = await login("alice", "앨리스");
  const b = await login("bob", "밥");
  const admin = await login("admin", "관리자");
  const id = (await call("POST", a, { body: { content: "오타가 있는 댓글" } })).json.comments[0].id;

  assert.equal((await call("PUT", b, { query: { id: String(id) }, body: { content: "남의 글 수정" } })).status, 403);
  assert.equal((await call("PUT", admin, { query: { id: String(id) }, body: { content: "관리자 수정" } })).status, 403);
  assert.equal((await call("PUT", a, { query: { id: String(id) }, body: { content: "  " } })).status, 400);

  const r = await call("PUT", a, { query: { id: String(id) }, body: { content: "고친 댓글" } });
  assert.equal(r.status, 200);
  const c = findIn(r.json, id);
  assert.equal(c.content, "고친 댓글");
  assert.equal(c.edited, true);
});

test("삭제: 본인 댓글은 본인이 지울 수 있음, 남의 댓글은 불가", async () => {
  const a = await login("alice", "앨리스");
  const b = await login("bob", "밥");
  const id = (await call("POST", a, { body: { content: "내가 지울 댓글" } })).json.comments[0].id;
  assert.equal((await call("DELETE", b, { query: { id: String(id) } })).status, 403);
  const r = await call("DELETE", a, { query: { id: String(id) } });
  assert.equal(r.status, 200);
  assert.equal(findIn(r.json, id), undefined); // 답글 없는 댓글은 목록에서 사라짐
});

test("삭제: 관리자(admin)는 모든 댓글, 답글 달린 원댓글은 자리만 남음", async () => {
  const a = await login("alice", "앨리스");
  const b = await login("bob", "밥");
  const admin = await login("admin", "관리자");
  const id = (await call("POST", a, { body: { content: "지울 댓글" } })).json.comments[0].id;
  await call("POST", b, { body: { content: "답글", parentId: id } });

  assert.equal((await call("GET", a)).json.isAdmin, false);
  assert.equal((await call("GET", admin)).json.isAdmin, true);
  assert.equal((await call("DELETE", b, { query: { id: String(id) } })).status, 403);

  const after = await call("DELETE", admin, { query: { id: String(id) } });
  assert.equal(after.status, 200);
  const t = findIn(after.json, id);
  assert.equal(t.deleted, true);
  assert.equal(t.content, "");
  assert.equal(t.replies.length, 1);
  assert.equal((await call("DELETE", admin, { query: { id: String(id) } })).status, 404); // 두 번 삭제
  assert.equal((await call("PUT", a, { query: { id: String(id) }, body: { content: "부활" } })).status, 404); // 지운 글 수정 불가
  assert.equal((await call("POST", b, { body: { content: "또 답글", parentId: id } })).status, 404); // 지운 댓글엔 답글 불가
});

test("입력 검증", async () => {
  const a = await login("alice", "앨리스");
  assert.equal((await call("POST", a, { body: { content: "   " } })).json.content, "내용을 입력해주세요.");
  assert.equal((await call("POST", a, { body: { content: "가".repeat(1001) } })).status, 400);
  assert.equal((await call("POST", a, { body: { content: "x", parentId: 999999 } })).status, 404);
  assert.equal((await call("POST", a, { body: { content: 123 } })).status, 400);
  assert.equal((await call("PUT", a, { query: { id: "abc" }, body: { content: "x" } })).status, 400);
});

test("관리자는 admin 계정만", () => {
  const s = (loginId: string) => ({ userId: 1, loginId, username: null });
  assert.equal(isAdmin(s("admin")), true);
  assert.equal(isAdmin(s("Admin")), false);
  assert.equal(isAdmin(s("admin2")), false);
  assert.equal(isAdmin(null), false);
});

test("답글 없는 지운 원댓글은 목록에서 사라짐", () => {
  const row = (commentId: number, parentId: number | null, deleted = false) =>
    ({ commentId, userId: 1, parentId, content: deleted ? "" : "c", deleted, createdAt: new Date(commentId * 1000).toISOString(), updatedAt: null });
  const t = buildThreads([row(1, null, true), row(2, null), row(3, 2, true)], 1);
  assert.deepEqual(t.map((c) => c.id), [2]);
  assert.equal(t[0].replies.length, 0); // 지운 답글도 숨김
});

test("admin 아이디로는 회원가입 불가 (대소문자만 바꾼 것도)", async () => {
  for (const loginId of ["admin", "Admin", "ADMIN"]) {
    const r = await call("POST", null, { body: { loginId, password: "pass1234", username: "x" } }, register);
    assert.equal(r.status, 400);
    assert.equal(r.json, "사용할 수 없는 아이디입니다.");
    // 새 계정이 생기지 않음 (앞 테스트에서 직접 만든 admin 계정은 그대로 남아 있어야 함)
    assert.ok([undefined, "x"].includes((await findUserByLoginId(loginId))?.password));
  }
  const ok = await call("POST", null, { body: { loginId: "admin2", password: "pass1234", username: "x" } }, register);
  assert.equal(ok.status, 200); // 비슷하지만 다른 아이디는 가입 가능 (관리자 권한은 없음)
});
