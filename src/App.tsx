import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import LoginPage from "./LoginPage";
import FittingPage from "./FittingPage";
import WishlistPage from "./WishlistPage";

const IDLE_WARNING_MS = 25 * 60 * 1000; // 25분 무활동 시 경고
const IDLE_TIMEOUT_MS =  5 * 60 * 1000; // 경고 후 5분 내 미응답 시 로그아웃

// 페이지 전환은 주소의 # 뒤로 구분 (#/wishlist). 라우터 없이도 새로고침·뒤로가기가 동작하고,
// Vercel에 경로별 재작성(rewrite) 설정을 추가할 필요가 없음
type Page = "fitting" | "wishlist";
const pageFromHash = (): Page => (window.location.hash === "#/wishlist" ? "wishlist" : "fitting");
function usePage(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((p: Page) => {
    window.location.hash = p === "wishlist" ? "/wishlist" : "";
    window.scrollTo(0, 0);
  }, []);
  return [page, go];
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn]   = useState(false);
  const [userId, setUserId]           = useState<number | null>(null);
  const [username, setUsername]       = useState<string>("");
  const [checking, setChecking]       = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [remaining, setRemaining]     = useState(300);
  const [page, goTo]                  = usePage();

  const warningTimer = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const logoutTimer  = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const countdown    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 로그아웃 실행 ─────────────────────────────────────────────
  const doLogout = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (logoutTimer.current)  clearTimeout(logoutTimer.current);
    if (countdown.current)    clearInterval(countdown.current);
    axios.post("/api/login/logout", {}, { withCredentials: true }).finally(() => {
      setIsLoggedIn(false);
      setUserId(null);
      setUsername("");
      setShowWarning(false);
    });
  }, []);

  // ── 유휴 타이머 리셋 (활동 감지 시 호출) ──────────────────────
  const resetIdleTimer = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (logoutTimer.current)  clearTimeout(logoutTimer.current);
    if (countdown.current)    clearInterval(countdown.current);
    setShowWarning(false);

    warningTimer.current = setTimeout(() => {
      // 25분 후: 경고 모달 + 카운트다운 시작
      setShowWarning(true);
      setRemaining(300);

      countdown.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(countdown.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      logoutTimer.current = setTimeout(doLogout, IDLE_TIMEOUT_MS);
    }, IDLE_WARNING_MS);
  }, [doLogout]);

  // ── 새로고침 시 세션 확인 ─────────────────────────────────────
  useEffect(() => {
    axios.get("/api/login/check", { withCredentials: true })
      .then((res) => {
        setUserId(res.data.userId);
        setUsername(res.data.username);
        setIsLoggedIn(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  // ── axios 401 인터셉터 (서버 세션 만료 감지) ──────────────────
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && isLoggedIn) {
          doLogout();
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, [isLoggedIn, doLogout]);

  // ── 유휴 감지 이벤트 리스너 등록/해제 ────────────────────────
  useEffect(() => {
    if (!isLoggedIn) return;

    const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    EVENTS.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // 로그인 직후 타이머 시작

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (warningTimer.current) clearTimeout(warningTimer.current);
      if (logoutTimer.current)  clearTimeout(logoutTimer.current);
      if (countdown.current)    clearInterval(countdown.current);
    };
  }, [isLoggedIn, resetIdleTimer]);

  // ── 로그인 성공 ───────────────────────────────────────────────
  const handleLoginSuccess = (id: number, name: string) => {
    setUserId(id);
    setUsername(name);
    setIsLoggedIn(true);
  };

  // ── 수동 로그아웃 ─────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    doLogout();
  }, [doLogout]);

  if (checking) return null;

  const mins = String(Math.floor(remaining / 60)).padStart(2, "0");
  const secs = String(remaining % 60).padStart(2, "0");

  return (
    <>
      {!isLoggedIn ? (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      ) : (
        page === "wishlist"
          ? <WishlistPage username={username} onBack={() => goTo("fitting")} onLogout={handleLogout} />
          : <FittingPage userId={userId!} username={username} onLogout={handleLogout} onOpenWishlist={() => goTo("wishlist")} />
      )}

      {/* ── 자동 로그아웃 경고 모달 ── */}
      {showWarning && (
        <div style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999,
        }}>
          <div style={{
            background: "white", borderRadius: "20px",
            padding: "36px 40px", maxWidth: "380px", width: "90%",
            textAlign: "center",
            boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            animation: "fadeIn 0.2s ease",
          }}>
            <div style={{ fontSize: "52px", marginBottom: "14px" }}>⏱️</div>
            <h2 style={{ margin: "0 0 10px", color: "#202124", fontSize: "18px", fontWeight: 700 }}>
              자동 로그아웃 예정
            </h2>
            <p style={{ color: "#5f6368", fontSize: "13px", lineHeight: 1.7, margin: "0 0 22px" }}>
              장시간 활동이 없어 곧 자동으로 로그아웃됩니다.<br />
              계속 사용하시려면 아래 버튼을 눌러주세요.
            </p>

            {/* 카운트다운 */}
            <div style={{
              fontSize: "42px", fontWeight: "bold",
              color: remaining <= 60 ? "#d93025" : "#1a73e8",
              marginBottom: "28px",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "2px",
              transition: "color 0.3s",
            }}>
              {mins}:{secs}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={resetIdleTimer}
                style={{
                  flex: 2, padding: "13px 0",
                  backgroundColor: "#1a73e8", color: "white",
                  border: "none", borderRadius: "10px",
                  cursor: "pointer", fontWeight: "bold", fontSize: "14px",
                  transition: "background 0.15s",
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1557b0")}
                onMouseOut={(e)  => (e.currentTarget.style.backgroundColor = "#1a73e8")}
              >
                계속 사용하기
              </button>
              <button
                onClick={handleLogout}
                style={{
                  flex: 1, padding: "13px 0",
                  backgroundColor: "#f1f3f4", color: "#5f6368",
                  border: "1px solid #dadce0", borderRadius: "10px",
                  cursor: "pointer", fontSize: "14px",
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e8eaed")}
                onMouseOut={(e)  => (e.currentTarget.style.backgroundColor = "#f1f3f4")}
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
