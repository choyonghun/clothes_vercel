import { route, ok, badRequest, denyUnlessOwner } from "../../server/http";
import { parsePantsSize } from "../../server/models";
import { savePantsSize } from "../../server/repository";

// POST /api/bodycheck/pants — 바지 치수 저장/업데이트
export default route({
  POST: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const { value, errors } = parsePantsSize(req.body);
    if (Object.keys(errors).length) return badRequest(errors);
    const notOwner = denyUnlessOwner(req, value.userId);
    if (notOwner) return notOwner;
    await savePantsSize(value);
    return ok(value);
  },
});
