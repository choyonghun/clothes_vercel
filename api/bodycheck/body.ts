import { route, ok, badRequest, denyUnlessOwner } from "../../server/http";
import { parseBodySize } from "../../server/models";
import { saveBodySize } from "../../server/repository";

// POST /api/bodycheck/body — 신체 치수 저장/업데이트
export default route({
  POST: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const { value, errors } = parseBodySize(req.body);
    if (Object.keys(errors).length) return badRequest(errors);
    const notOwner = denyUnlessOwner(req, value.userId);
    if (notOwner) return notOwner;
    await saveBodySize(value);
    return ok(value);
  },
});
