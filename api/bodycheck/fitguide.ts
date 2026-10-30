import { route, ok } from "../../server/http";
import { analyzeFit } from "../../server/fitGuide";

// POST /api/bodycheck/fitguide — 입력한 신체·옷 치수로 핏 분석 (DB를 쓰지 않는 계산이라 로그인 불필요, Java 버전과 동일)
export default route({
  POST: async (req) => {
    const { body, cloth, pants } = req.body || {};
    return ok(analyzeFit(body, cloth, pants));
  },
});
