import { route, ok, text, denyUnlessOwner } from "../../../server/http";
import { emptyBody, emptyCloth, emptyPants } from "../../../server/models";
import { findBodyById, findClothById, findPantsById } from "../../../server/repository";

// GET /api/bodycheck/allstats/{userId} — 로그인 시 신체·옷·바지 데이터를 한 번에 조회
export default route({
  GET: async (req) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId)) return text(400, "잘못된 요청 형식입니다.");
    const denied = denyUnlessOwner(req, userId);
    if (denied) return denied;

    const [body, cloth, pants] = await Promise.all([findBodyById(userId), findClothById(userId), findPantsById(userId)]);
    // 리액트에서 에러가 나지 않도록 데이터가 없으면 빈 객체를 넣어줌
    return ok({ body: body ?? emptyBody(), cloth: cloth ?? emptyCloth(), pants: pants ?? emptyPants() });
  },
});
