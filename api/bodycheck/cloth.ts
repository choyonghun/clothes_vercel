import { route, ok, badRequest, denyUnlessOwner } from "../../server/http";
import { parseClothSize } from "../../server/models";
import { saveClothSize } from "../../server/repository";

// POST /api/bodycheck/cloth — 상의 치수 저장/업데이트
export default route({
  POST: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const { value, errors } = parseClothSize(req.body);
    if (Object.keys(errors).length) return badRequest(errors);
    const notOwner = denyUnlessOwner(req, value.userId);
    if (notOwner) return notOwner;
    await saveClothSize(value);
    return ok(value);
  },
});
