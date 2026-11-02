import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

// "개발자한테 바라는 목록" — 핏 화면에 대한 의견을 댓글로 남기는 페이지.
// 로그인한 사용자만 들어올 수 있고, 댓글은 모두 "익명"으로 표시됨.
// 원댓글 + 답글(1단계). 내가 쓴 댓글은 수정·삭제 가능, 관리자(admin 계정)는 모든 댓글 삭제 가능

interface Comment {
  id: number;
  author: string;
  content: string;
  createdAt: string;
  edited: boolean;
  mine: boolean;
  deleted: boolean;
  replies: Comment[];
}
interface ListResponse { comments: Comment[]; total: number; isAdmin: boolean }

const MAX = 1000;

export default function WishlistPage({ username, onBack, onLogout }: { username: string; onBack: () => void; onLogout: () => void }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoadError("");
    axios.get<ListResponse>("/api/wishlist", { withCredentials: true })
      .then((r) => setData(r.data))
      .catch((e) => setLoadError(errorText(e, "목록을 불러오지 못했습니다.")));
  }, []);
  useEffect(load, [load]);

  /** 성공하면 null, 실패하면 화면에 보여줄 오류 문구 (성공 시 입력창을 비우기 위해) */
  const submit = async (content: string, parentId: number | null): Promise<string | null> => {
    try {
      const r = await axios.post<ListResponse>("/api/wishlist", { content, parentId }, { withCredentials: true });
      setData(r.data);
      if (parentId !== null) setReplyTo(null);
      return null;
    } catch (e) {
      return errorText(e, "등록하지 못했습니다.");
    }
  };

  const save = async (id: number, content: string): Promise<string | null> => {
    try {
      const r = await axios.put<ListResponse>(`/api/wishlist?id=${id}`, { content }, { withCredentials: true });
      setData(r.data);
      setEditing(null);
      return null;
    } catch (e) {
      return errorText(e, "수정하지 못했습니다.");
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    try {
      const r = await axios.delete<ListResponse>(`/api/wishlist?id=${id}`, { withCredentials: true });
      setData(r.data);
    } catch (e) {
      alert(errorText(e, "삭제하지 못했습니다."));
    }
  };

  // 댓글 하나에 넘길 수정·삭제 관련 props
  const itemProps = (c: Comment) => ({
    canDelete: c.mine || !!data?.isAdmin,
    onDelete: remove,
    editing: editing === c.id,
    onEdit: () => { setEditing(c.id); setReplyTo(null); },
    onCancelEdit: () => setEditing(null),
    onSave: (content: string) => save(c.id, content),
  });

  return (
    <div style={{ backgroundColor: "#f8f9fa", minHeight: "100vh", padding: 20, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ── 상단 바 ── */}
        <div style={{ ...panel, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={ghostBtn}>← 핏 화면으로</button>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#5f6368" }}>
            {data?.isAdmin && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#d93025", borderRadius: 8, padding: "2px 7px", marginRight: 6 }}>관리자</span>}
            <b style={{ color: "#1a73e8" }}>{username}</b>님
          </div>
          <button onClick={onLogout} style={ghostBtn}>로그아웃</button>
        </div>

        {/* ── 작성 ── */}
        <div style={panel}>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#202124" }}>개발자한테 바라는 목록</h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "#80868b", lineHeight: 1.6 }}>
            핏 화면을 쓰면서 불편했던 점, 있었으면 하는 기능, 이상하게 보이는 그림 등을 자유롭게 남겨주세요.
            다른 사람 의견에 답글로 공감이나 보충 의견을 달 수도 있습니다.
          </p>
          <div style={{ fontSize: 12, color: "#5f6368", background: "#f1f3f4", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px", lineHeight: 1.6 }}>
            🔒 모든 댓글은 <b>익명</b>으로 등록되어 다른 사람에게 이름·아이디가 보이지 않습니다.
            내가 쓴 댓글은 수정·삭제할 수 있습니다.
          </div>
          <Composer placeholder="개발자에게 바라는 점을 적어주세요 (익명으로 등록됩니다)" submitLabel="등록" onSubmit={(c) => submit(c, null)} />
        </div>

        {/* ── 목록 ── */}
        <div style={panel}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: "#202124" }}>
              댓글 {data && <span style={{ color: "#1a73e8" }}>{data.total}</span>}
            </h3>
            <button onClick={load} style={{ ...ghostBtn, marginLeft: "auto" }}>새로고침</button>
          </div>

          {loadError && <div style={errorBox}>{loadError}</div>}
          {!data && !loadError && <div style={emptyText}>불러오는 중…</div>}
          {data && data.comments.length === 0 && <div style={emptyText}>아직 남겨진 의견이 없습니다. 첫 의견을 남겨주세요!</div>}

          {data?.comments.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid #f1f3f4", padding: "14px 0" }}>
              <CommentItem c={c} {...itemProps(c)} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} replying={replyTo === c.id} />

              {(c.replies.length > 0 || replyTo === c.id) && (
                <div style={{ marginLeft: 44, marginTop: 10, paddingLeft: 14, borderLeft: "2px solid #e8eaed", display: "flex", flexDirection: "column", gap: 12 }}>
                  {c.replies.map((r) => (
                    <CommentItem key={r.id} c={r} small {...itemProps(r)} onReply={() => setReplyTo(c.id)} replying={false} />
                  ))}
                  {replyTo === c.id && (
                    <Composer autoFocus small placeholder="익명으로 답글 남기기" submitLabel="답글 등록"
                      onSubmit={(content) => submit(content, c.id)} onCancel={() => setReplyTo(null)} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CommentItem({ c, small, replying, onReply, canDelete, onDelete, editing, onEdit, onCancelEdit, onSave }: {
  c: Comment; small?: boolean; replying: boolean; onReply: () => void;
  canDelete: boolean; onDelete: (id: number) => void;
  editing: boolean; onEdit: () => void; onCancelEdit: () => void; onSave: (content: string) => Promise<string | null>;
}) {
  if (c.deleted) return <div style={{ fontSize: 13, color: "#9aa0a6", padding: "4px 0 4px 44px" }}>삭제된 댓글입니다.</div>;
  const size = small ? 26 : 32;
  return (
    <div style={{ display: "flex", gap: small ? 10 : 12 }}>
      <div aria-hidden style={{
        width: size, height: size, borderRadius: "50%", flex: "none", background: c.mine ? "#1a73e8" : "#9aa0a6", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: small ? 12 : 14, fontWeight: 700,
      }}>{c.author.slice(0, 1)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#202124" }}>{c.author}</span>
          {c.mine && <span style={{ fontSize: 10.5, color: "#1a73e8", background: "#e8f0fe", borderRadius: 8, padding: "1px 6px" }}>나</span>}
          <span style={{ fontSize: 12, color: "#9aa0a6" }} title={new Date(c.createdAt).toLocaleString("ko-KR")}>{timeAgo(c.createdAt)}</span>
          {c.edited && <span style={{ fontSize: 11.5, color: "#9aa0a6" }}>(수정됨)</span>}
        </div>
        {editing ? (
          <div style={{ marginTop: 6 }}>
            <Composer autoFocus small initial={c.content} placeholder="댓글 수정" submitLabel="저장" onSubmit={onSave} onCancel={onCancelEdit} />
          </div>
        ) : (
          <>
            <div style={{ fontSize: small ? 13 : 14, color: "#3c4043", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>
              {c.content}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <button onClick={onReply} style={linkBtn}>{replying ? "답글 취소" : "답글"}</button>
              {c.mine && <button onClick={onEdit} style={linkBtn}>수정</button>}
              {canDelete && <button onClick={() => onDelete(c.id)} style={{ ...linkBtn, color: "#d93025" }}>삭제</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Composer({ placeholder, submitLabel, onSubmit, onCancel, small, autoFocus, initial = "" }: {
  placeholder: string; submitLabel: string; small?: boolean; autoFocus?: boolean; initial?: string;
  onSubmit: (content: string) => Promise<string | null>; onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 수정할 때 내용이 그대로면 저장 버튼을 막음
  const empty = !text.trim() || (!!initial && text.trim() === initial.trim());

  const send = async () => {
    if (empty || busy) return;
    setBusy(true); setError("");
    const err = await onSubmit(text.trim());
    setBusy(false);
    if (err) setError(err); else setText(initial ? text.trim() : "");
  };

  return (
    <div>
      <textarea value={text} autoFocus={autoFocus} maxLength={MAX} placeholder={placeholder} rows={small ? 2 : 3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
        style={{
          width: "100%", boxSizing: "border-box", resize: "vertical", padding: "10px 12px", fontSize: 14, lineHeight: 1.5,
          fontFamily: "inherit", border: "1px solid #dadce0", borderRadius: 8, outline: "none",
        }} />
      {error && <div style={{ ...errorBox, marginTop: 6 }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 11.5, color: "#9aa0a6" }}>{text.length}/{MAX} · Ctrl+Enter로 등록</span>
        {onCancel && <button onClick={onCancel} style={{ ...ghostBtn, marginLeft: "auto" }}>취소</button>}
        <button onClick={send} disabled={empty || busy} style={{
          marginLeft: onCancel ? 0 : "auto", padding: "7px 16px", fontSize: 13, fontWeight: 700, border: "none", borderRadius: 8,
          background: empty || busy ? "#c6dafc" : "#1a73e8", color: "#fff", cursor: empty || busy ? "not-allowed" : "pointer",
        }}>{busy ? "등록 중…" : submitLabel}</button>
      </div>
    </div>
  );
}

// ── 도우미 ─────────────────────────────────────────────
function errorText(e: unknown, fallback: string) {
  const d = (e as any)?.response?.data;
  if (typeof d === "string" && d) return d;
  if (d && typeof d === "object") return Object.values(d).join(" ") || fallback;
  return fallback;
}

function timeAgo(iso: string) {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "방금 전";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

const panel: React.CSSProperties = { background: "white", padding: 20, borderRadius: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.05)" };
const ghostBtn: React.CSSProperties = {
  padding: "6px 12px", fontSize: 12.5, fontWeight: 600, background: "#fff", color: "#5f6368",
  border: "1px solid #dadce0", borderRadius: 6, cursor: "pointer",
};
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 600, color: "#5f6368", cursor: "pointer" };
const emptyText: React.CSSProperties = { fontSize: 13, color: "#9aa0a6", padding: "24px 0", textAlign: "center" };
const errorBox: React.CSSProperties = { fontSize: 12.5, color: "#d93025", background: "#fce8e6", borderRadius: 6, padding: "6px 10px" };
