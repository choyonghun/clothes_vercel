import { route, ok, text } from "../../server/http";

// GET /api/login/check — 새로고침 시 세션(로그인 쿠키)을 확인하여 로그인 상태를 유지
export default route({
  GET: async (req) => {
    if (!req.session) return text(401, "로그인 정보가 없습니다.");
    return ok({ userId: req.session.userId, username: req.session.username });
  },
});
