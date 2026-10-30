import { route, text } from "../../server/http";
import { clearSessionCookie } from "../../server/session";

// POST /api/login/logout — 로그인 쿠키 삭제
export default route({
  POST: async (req) => ({ ...text(200, "로그아웃 성공"), cookies: [clearSessionCookie(req.secure)] }),
});
