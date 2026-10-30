import bcrypt from "bcryptjs";
import { route, text, badRequest } from "../../server/http";
import { parseUser } from "../../server/models";
import { findUserByLoginId } from "../../server/repository";
import { sessionCookie } from "../../server/session";

// POST /api/login — 로그인 (Java LoginController.login)
export default route({
  POST: async (req) => {
    const { value, errors } = parseUser(req.body);
    if (Object.keys(errors).length) return badRequest(errors);

    const user = await findUserByLoginId(value.loginId);
    // 사용자가 존재하고 비밀번호가 일치하는지 확인 (BCrypt 비교)
    if (!user || !(await bcrypt.compare(value.password, user.password)))
      return text(401, "아이디 또는 비밀번호가 틀렸습니다.");

    const session = { userId: user.userId!, loginId: user.loginId, username: user.username };
    // 성공 시 사용자 정보 반환 (비밀번호 제외)
    return { json: { ...user, password: null }, cookies: [sessionCookie(session, req.secure)] };
  },
});
