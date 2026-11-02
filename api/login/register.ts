import bcrypt from "bcryptjs";
import { route, text, badRequest } from "../../server/http";
import { isReservedLoginId, parseUser } from "../../server/models";
import { findUserByLoginId, saveUser } from "../../server/repository";

const DUPLICATE = "이미 존재하는 로그인 ID입니다.";

// POST /api/login/register — 회원가입 (비밀번호는 BCrypt 해싱 후 저장)
export default route({
  POST: async (req) => {
    const { value, errors } = parseUser(req.body);
    if (Object.keys(errors).length) return badRequest(errors);
    // 관리자 아이디는 가입으로 만들 수 없음 (먼저 가입한 사람이 관리자 권한을 가져가지 않도록)
    if (isReservedLoginId(value.loginId)) return text(400, "사용할 수 없는 아이디입니다.");

    if (await findUserByLoginId(value.loginId)) return text(400, DUPLICATE);
    try {
      await saveUser({ ...value, password: await bcrypt.hash(value.password, 10) });
    } catch (e: any) {
      // 동시에 같은 아이디로 가입한 경우 (UNIQUE 제약 위반)
      if (e?.code === "23505") return text(400, DUPLICATE);
      throw e;
    }
    return text(200, "회원가입 성공");
  },
});
