import { route, ok, text, badRequest, denyUnlessOwner, type ApiRequest, type ApiResult } from "../../server/http";
import { parseComment } from "../../server/models";
import { deleteComment, findComment, insertComment, listComments, updateComment, type CommentRow } from "../../server/repository";
import { buildThreads, countComments, isAdmin } from "../../server/wishlist";

// /api/wishlist — "개발자한테 바라는 목록" 댓글 (로그인한 사용자만, 화면에는 익명으로 표시)
//   GET                          목록 (원댓글 + 답글)
//   POST   {content, parentId?}  댓글/답글 작성
//   PUT    ?id=123 {content}     내가 쓴 댓글 수정
//   DELETE ?id=123               댓글 삭제 (본인 댓글, 관리자 admin 계정은 모든 댓글)
// 쓰기·수정·삭제 뒤에는 최신 목록을 그대로 돌려줘서 화면이 한 번 더 요청하지 않게 함.
// (Vercel 무료 플랜은 함수 개수 제한이 있어 한 파일에서 메서드로 나눔)

async function list(req: ApiRequest) {
  const threads = buildThreads(await listComments(), req.session!.userId);
  return ok({ comments: threads, total: countComments(threads), isAdmin: isAdmin(req.session) });
}

/** ?id= 로 지정한 살아 있는 댓글 (없으면 오류 응답) */
async function target(req: ApiRequest): Promise<{ error: ApiResult } | { comment: CommentRow }> {
  const commentId = Number(req.query.id);
  if (!Number.isInteger(commentId)) return { error: text(400, "잘못된 요청 형식입니다.") };
  const comment = await findComment(commentId);
  if (!comment || comment.deleted) return { error: text(404, "삭제되었거나 없는 댓글입니다.") };
  return { comment };
}

export default route({
  GET: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    return list(req);
  },

  POST: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const { value, errors } = parseComment(req.body);
    if (Object.keys(errors).length) return badRequest(errors);

    let parentId = value.parentId;
    if (parentId !== null) {
      const parent = await findComment(parentId);
      if (!parent || parent.deleted) return text(404, "삭제되었거나 없는 댓글입니다.");
      // 답글에 단 답글은 원댓글 아래로 모음 (깊이 1단계 유지)
      parentId = parent.parentId ?? parent.commentId;
    }
    await insertComment(req.session!.userId, value.content, parentId);
    return list(req);
  },

  PUT: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const t = await target(req);
    if ("error" in t) return t.error;
    const { comment } = t;
    if (comment.userId !== req.session!.userId) return text(403, "본인이 쓴 댓글만 수정할 수 있습니다.");
    const { value, errors } = parseComment(req.body);
    if (Object.keys(errors).length) return badRequest(errors);
    await updateComment(comment.commentId, value.content);
    return list(req);
  },

  DELETE: async (req) => {
    const denied = denyUnlessOwner(req, null);
    if (denied) return denied;
    const t = await target(req);
    if ("error" in t) return t.error;
    const { comment } = t;
    if (comment.userId !== req.session!.userId && !isAdmin(req.session)) return text(403, "본인이 쓴 댓글만 삭제할 수 있습니다.");
    await deleteComment(comment.commentId);
    return list(req);
  },
});
