import type { CommentRow } from "./repository";
import type { Session } from "./session";
import { ADMIN_LOGIN_ID } from "./models";

// "개발자한테 바라는 목록" 화면에 보낼 댓글 트리.
// - 작성자는 모두 "익명"으로 표시하고, 응답에 이름·아이디·user_id를 담지 않음 (관리자에게도 마찬가지)
// - 수정: 본인 댓글만 / 삭제: 본인 댓글 + 관리자(admin 계정)는 모든 댓글
// - 원댓글은 최신순, 답글은 대화 흐름대로 오래된 순

export interface CommentView {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  edited: boolean;
  mine: boolean;       // 본인 글 → 수정·삭제 가능 ("나" 표시는 본인 화면에만 보임)
  deleted: boolean;
  replies: CommentView[];
}

export const ANONYMOUS = "익명";

export function isAdmin(session: Session | null) {
  return !!session && session.loginId === ADMIN_LOGIN_ID;
}

export function buildThreads(rows: CommentRow[], viewerId: number): CommentView[] {
  const view = (r: CommentRow): CommentView => ({
    id: r.commentId,
    author: r.deleted ? "" : ANONYMOUS,
    content: r.deleted ? "" : r.content,
    createdAt: r.createdAt,
    edited: !r.deleted && r.updatedAt !== null,
    mine: !r.deleted && r.userId === viewerId,
    deleted: r.deleted,
    replies: [],
  });

  const tops = new Map<number, CommentView>();
  for (const r of rows) if (r.parentId === null) tops.set(r.commentId, view(r));
  for (const r of rows) {
    if (r.parentId === null || r.deleted) continue; // 지운 답글은 아예 안 보여줌
    tops.get(r.parentId)?.replies.push(view(r));
  }
  // 지운 원댓글은 답글이 남아 있을 때만 "삭제된 댓글입니다" 자리로 남김
  return [...tops.values()].filter((c) => !c.deleted || c.replies.length > 0).reverse();
}

/** 화면에 보이는 댓글 수 (지운 원댓글 자리는 세지 않음) */
export const countComments = (threads: CommentView[]) =>
  threads.reduce((n, t) => n + (t.deleted ? 0 : 1) + t.replies.length, 0);
