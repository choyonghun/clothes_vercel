import { route, ok } from "../../server/http";
import { analyzeFit } from "../../server/fitGuide";

// POST /api/bodycheck/fitguide — 입력한 신체·옷 치수로 핏 분석 (DB를 쓰지 않는 계산이라 로그인 불필요, Java 버전과 동일).
// 화면은 같은 계산(src/fit/analyze.ts)을 브라우저에서 바로 실행하므로 이 API를 호출하지 않지만, 외부 호출용으로 유지
export default route({
  POST: async (req) => {
    const { body, cloth, pants, skirt, dress } = req.body || {};
    return ok(analyzeFit(body, cloth, pants, skirt, dress));
  },
});
