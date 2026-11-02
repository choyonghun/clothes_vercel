import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { analyzeOutfit, bySeverity } from "./fit/analyze";
import {
  BODY_PRESETS, Body, DEFAULT_BODY, DEFAULT_DRESS, DEFAULT_PANTS, DEFAULT_SKIRT, DEFAULT_TOP,
  Dress, FitItem, Level, Pants, PartId, Skirt, Top, withDefaults,
} from "./fit/types";
import FitFigure, { LEVEL_COLOR } from "./figure/FitFigure";
import {
  BODY_FIELDS, DRESS_FIELDS, FieldSpec, InfoHint, PANTS_FIELDS, SKIRT_FIELDS, TOP_FIELDS,
} from "./figure/MeasureHint";

// 입력 중에는 칸이 비어 있을 수 있으므로 "" 허용
type Form<T> = { [K in keyof T]: number | "" };
type OutfitType = "separate" | "dress";
type BottomType = "pants" | "skirt";

const MY_PRESET = "내 치수";

/** 입력이 멈춘 뒤 delay(ms)가 지나면 값을 반영 (타이핑 도중 "1"→"17"→"175"마다 그림이 요동치지 않게) */
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** 서버에 저장된 값 중 양수인 것만 기본값 위에 덮어씀 (구버전 데이터에 없는 항목은 기본값 유지) */
function mergeSaved<T extends object>(saved: any, defaults: T): { value: T; missing: boolean } {
  const value = { ...defaults };
  let missing = false;
  for (const k of Object.keys(defaults) as (keyof T)[]) {
    const n = Number(saved?.[k]);
    if (Number.isFinite(n) && n > 0) (value as any)[k] = n;
    else missing = true;
  }
  return { value, missing };
}

export default function FittingPage({ userId, username, onLogout, onOpenWishlist }: {
  userId: number; username: string; onLogout: () => void; onOpenWishlist: () => void;
}) {
  const [body, setBody] = useState<Form<Body>>(DEFAULT_BODY);
  const [top, setTop] = useState<Form<Top>>(DEFAULT_TOP);
  const [pants, setPants] = useState<Form<Pants>>(DEFAULT_PANTS);
  const [skirt, setSkirt] = useState<Form<Skirt>>(DEFAULT_SKIRT);
  const [dress, setDress] = useState<Form<Dress>>(DEFAULT_DRESS);
  const [colors, setColors] = useState({ top: "#ff7043", pants: "#1565c0", skirt: "#e91e63", dress: "#9c27b0" });

  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [outfitType, setOutfitType] = useState<OutfitType>("separate");
  const [bottomType, setBottomType] = useState<BottomType>("pants");
  const [showTop, setShowTop] = useState(true);
  const [showBottom, setShowBottom] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>("평균");
  const [savedBody, setSavedBody] = useState<Body | null>(null);
  const [legacyNotice, setLegacyNotice] = useState(false);
  const [focus, setFocus] = useState<PartId | null>(null);
  const [showOk, setShowOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(`/api/bodycheck/allstats/${userId}`);
        if (data.body?.height > 0) {
          const { value, missing } = mergeSaved(data.body, DEFAULT_BODY);
          setBody(value); setSavedBody(value); setActivePreset(MY_PRESET);
          setLegacyNotice(missing);
          setBodyExpanded(missing);
        }
        if (data.cloth?.shoulder > 0) {
          setTop(mergeSaved(data.cloth, DEFAULT_TOP).value);
          if (data.cloth.color) setColors((c) => ({ ...c, top: data.cloth.color }));
        }
        if (data.pants?.pantsLength > 0) {
          setPants(mergeSaved(data.pants, DEFAULT_PANTS).value);
          if (data.pants.color) setColors((c) => ({ ...c, pants: data.pants.color }));
        }
      } catch (e) { console.error("데이터 로딩 실패:", e); }
    })();
  }, [userId]);

  // ── 입력 → (300ms 뒤) 그림·핏 판정 자동 갱신. 계산은 브라우저에서 바로 하므로 서버 왕복이 없음 ──
  const dBody = useDebounced(body), dTop = useDebounced(top), dPants = useDebounced(pants);
  const dSkirt = useDebounced(skirt), dDress = useDebounced(dress);
  const bodyValue = useMemo(() => withDefaults(dBody, DEFAULT_BODY), [dBody]);
  const outfit = useMemo(() => ({
    top: outfitType === "separate" && showTop ? withDefaults(dTop, DEFAULT_TOP) : null,
    pants: outfitType === "separate" && showBottom && bottomType === "pants" ? withDefaults(dPants, DEFAULT_PANTS) : null,
    skirt: outfitType === "separate" && showBottom && bottomType === "skirt" ? withDefaults(dSkirt, DEFAULT_SKIRT) : null,
    dress: outfitType === "dress" ? withDefaults(dDress, DEFAULT_DRESS) : null,
  }), [outfitType, showTop, showBottom, bottomType, dTop, dPants, dSkirt, dDress]);
  const items = useMemo(() => analyzeOutfit(bodyValue, outfit).sort(bySeverity), [bodyValue, outfit]);
  const issues = items.filter((i) => i.level !== "ok");
  const oks = items.filter((i) => i.level === "ok");

  const onField = <T,>(setter: React.Dispatch<React.SetStateAction<Form<T>>>, after?: () => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setter((prev) => ({ ...prev, [name]: value === "" ? "" : Number(value) }));
      after?.();
    };

  const sendToServer = async () => {
    const missing = BODY_FIELDS.filter((f) => body[f.key as keyof Body] === "");
    if (missing.length) {
      setBodyExpanded(true);
      alert(`신체 치수는 필수 입력 항목입니다. 빠진 값: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    try {
      await axios.post("/api/bodycheck/body", { ...body, userId });
      await axios.post("/api/bodycheck/cloth", { ...top, userId, color: colors.top });
      await axios.post("/api/bodycheck/pants", { ...pants, userId, color: colors.pants });
      setSavedBody(withDefaults(body, DEFAULT_BODY));
      setActivePreset(MY_PRESET);
      setLegacyNotice(false);
      alert("데이터 전송 및 저장 성공!");
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      // 검증 실패(400)는 { 필드명: 메시지 } 형태 → 화면 라벨로 바꿔서 보여줌
      const labels = Object.fromEntries([...BODY_FIELDS, ...TOP_FIELDS, ...PANTS_FIELDS].map((f) => [f.key, f.label]));
      const msg = data && typeof data === "object"
        ? Object.entries(data).map(([field, m]) => `${labels[field] || field}: ${m}`).join("\n")
        : data || error?.message || "알 수 없는 오류";
      alert(`서버 저장 실패 [${status}]: ${msg}`);
    }
  };

  // ── 화면 조각 ──
  const fieldRow = <T,>(spec: FieldSpec, form: Form<T>, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, required = false) => {
    const value = form[spec.key as keyof T] as number | "";
    return (
      <div key={spec.key} style={{ marginBottom: 7 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label htmlFor={`f-${spec.key}`} style={{ fontSize: 13, fontWeight: 600, color: "#5f6368", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
            {spec.label}{required && <span style={{ color: "#d93025" }}>&nbsp;*</span>}
            <InfoHint spec={spec} />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input id={`f-${spec.key}`} name={spec.key} type="number" inputMode="decimal" value={value} onChange={onChange}
              style={{ width: 70, padding: "5px 8px", borderRadius: 6, fontSize: 13, textAlign: "right",
                       border: `1px solid ${required && value === "" ? "#d93025" : "#dadce0"}` }} />
            <span style={{ fontSize: 12, color: "#9aa0a6" }}>cm</span>
          </div>
        </div>
        {spec.flat && value !== "" && (
          <div style={{ textAlign: "right", fontSize: 11, color: "#9aa0a6", marginTop: 2 }}>둘레 환산 {Math.round(Number(value) * 2 * 10) / 10}cm</div>
        )}
      </div>
    );
  };

  const colorRow = (label: string, key: keyof typeof colors) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#5f6368" }}>{label}</label>
      <input type="color" value={colors[key]} onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
        style={{ width: 60, height: 30, border: "1px solid #dadce0", borderRadius: 6, cursor: "pointer", padding: 2 }} />
    </div>
  );

  return (
    <div style={{ display: "flex", padding: 20, gap: 24, backgroundColor: "#f8f9fa", minHeight: "100vh", boxSizing: "border-box" }}>

      {/* ── 입력 패널 ── */}
      <div style={{ ...panel, width: 320, flex: "none" }}>
        <SectionTitle onClick={() => setBodyExpanded((v) => !v)} right={bodyExpanded ? "▲" : "▼"}>
          신체 치수 <span style={{ fontSize: 11, fontWeight: 400, color: "#d93025" }}>(필수)</span>
        </SectionTitle>
        {bodyExpanded && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {Object.keys(BODY_PRESETS).map((label) => (
                <ToggleBtn key={label} label={label} active={activePreset === label}
                  onClick={() => { setBody(BODY_PRESETS[label]); setActivePreset(label); }} />
              ))}
              <ToggleBtn label={MY_PRESET} active={activePreset === MY_PRESET} disabled={!savedBody}
                title={savedBody ? "서버에 저장한 내 신체 치수 불러오기" : "저장한 치수가 없습니다"}
                onClick={() => { if (savedBody) { setBody(savedBody); setActivePreset(MY_PRESET); } }} />
            </div>
            {legacyNotice && (
              <div style={{ fontSize: 11.5, color: "#b06000", background: "#fef7e0", borderRadius: 6, padding: "6px 8px", marginBottom: 8, lineHeight: 1.5 }}>
                측정 기준이 둘레로 바뀌었습니다. 이전에 저장한 치수에 없는 항목은 기본값으로 채웠으니 확인 후 다시 저장해 주세요.
              </div>
            )}
            {BODY_FIELDS.map((f) => fieldRow(f, body, onField(setBody, () => setActivePreset(null)), true))}
          </>
        )}

        <SectionTitle>복장</SectionTitle>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {/* 복장 종류를 바꾸면 항상 다 입은 상태로 시작 (원피스 ↔ 상의+하의를 오갈 때 옷이 빠진 채로 남지 않게) */}
          <ToggleBtn label="상의 + 하의" active={outfitType === "separate"} onClick={() => { setOutfitType("separate"); setShowTop(true); setShowBottom(true); }} />
          <ToggleBtn label="원피스" active={outfitType === "dress"} onClick={() => setOutfitType("dress")} />
        </div>

        {outfitType === "separate" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <ToggleBtn label={`상의 ${showTop ? "보이기" : "숨김"}`} active={showTop} onClick={() => setShowTop((v) => !v)} />
              <ToggleBtn label={`하의 ${showBottom ? "보이기" : "숨김"}`} active={showBottom} onClick={() => setShowBottom((v) => !v)} />
            </div>

            <SectionTitle>상의 치수 <Sub>평면 실측</Sub></SectionTitle>
            {colorRow("색상", "top")}
            {TOP_FIELDS.map((f) => fieldRow(f, top, onField(setTop)))}

            <SectionTitle>하의 치수 <Sub>평면 실측</Sub></SectionTitle>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <ToggleBtn label="바지" active={bottomType === "pants"} onClick={() => setBottomType("pants")} />
              <ToggleBtn label="치마" active={bottomType === "skirt"} onClick={() => setBottomType("skirt")} />
            </div>
            {bottomType === "pants" && <>{colorRow("색상", "pants")}{PANTS_FIELDS.map((f) => fieldRow(f, pants, onField(setPants)))}</>}
            {bottomType === "skirt" && <>{colorRow("색상", "skirt")}{SKIRT_FIELDS.map((f) => fieldRow(f, skirt, onField(setSkirt)))}</>}
          </>
        )}

        {outfitType === "dress" && (
          <>
            <SectionTitle>원피스 치수 <Sub>평면 실측</Sub></SectionTitle>
            {colorRow("색상", "dress")}
            {DRESS_FIELDS.map((f) => fieldRow(f, dress, onField(setDress)))}
          </>
        )}

        <button onClick={sendToServer} style={{ marginTop: 24, width: "100%", padding: 14, backgroundColor: "#1a73e8", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: "bold" }}>
          측정 데이터 서버 저장
        </button>
        <p style={{ fontSize: 11, color: "#9aa0a6", margin: "8px 0 0", lineHeight: 1.5 }}>신체·상의·바지 치수가 저장됩니다. (치마·원피스는 저장되지 않음)</p>
      </div>

      {/* ── 핏 다이어그램 ── */}
      <div style={{ ...panel, flex: 1, minWidth: 420, height: 860, padding: "16px 20px", boxSizing: "border-box" }}>
        <FitFigure body={bodyValue} outfit={outfit} colors={colors} items={items} focus={focus} onFocus={setFocus} />
      </div>

      {/* ── 핏 가이드 ── */}
      <div style={{ ...panel, width: 280, flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={onOpenWishlist} style={{
          width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 700, backgroundColor: "#e8f0fe", color: "#1967d2",
          border: "1px solid #d2e3fc", borderRadius: 8, cursor: "pointer",
        }}>
          💬 개발자한테 바라는 목록
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, borderBottom: "1px solid #f0f0f0" }}>
          <div>
            <span style={{ fontWeight: "bold", color: "#1a73e8", fontSize: 16 }}>{username}</span>
            <span style={{ color: "#5f6368", fontSize: 13 }}>님 환영합니다!</span>
          </div>
          <button onClick={onLogout} style={{ padding: "5px 10px", fontSize: 12, fontWeight: "bold", backgroundColor: "#fff", color: "#5f6368", border: "1px solid #dadce0", borderRadius: 6, cursor: "pointer" }}>
            로그아웃
          </button>
        </div>

        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "#202124" }}>핏 가이드</h3>
          <p style={{ margin: 0, fontSize: 12, color: "#9aa0a6", lineHeight: 1.5 }}>
            치수를 바꾸면 자동으로 다시 계산됩니다. 항목에 마우스를 올리면 그림에서 위치를 보여줍니다.
          </p>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: "center", color: "#bdbdbd", fontSize: 12, marginTop: 20 }}>보이는 옷이 없습니다</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["danger", "warning", "info", "ok"] as Level[]).map((l) => {
                const n = items.filter((i) => i.level === l).length;
                return n ? <span key={l} style={{ fontSize: 11.5, fontWeight: 600, color: LEVEL_COLOR[l], background: `${LEVEL_COLOR[l]}14`, borderRadius: 10, padding: "2px 8px" }}>
                  {{ danger: "맞지 않음", warning: "주의", info: "참고", ok: "적정" }[l]} {n}
                </span> : null;
              })}
            </div>

            {issues.map((it) => <FitCard key={it.id} item={it} active={focus === it.id} onHover={setFocus} />)}
            {issues.length === 0 && (
              <div style={{ fontSize: 13, color: "#188038", background: "#e6f4ea", borderRadius: 10, padding: "10px 12px" }}>모든 항목이 적정합니다 👍</div>
            )}

            {oks.length > 0 && (
              <>
                <button onClick={() => setShowOk((v) => !v)} style={{ background: "none", border: "none", padding: "4px 0", textAlign: "left", fontSize: 12.5, color: "#5f6368", cursor: "pointer", fontWeight: 600 }}>
                  {showOk ? "▾" : "▸"} 적정 항목 {oks.length}개 {showOk ? "접기" : "보기"}
                </button>
                {showOk && oks.map((it) => <FitCard key={it.id} item={it} active={focus === it.id} onHover={setFocus} compact />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const panel: React.CSSProperties = { background: "white", padding: 20, borderRadius: 16, boxShadow: "0 10px 25px rgba(0,0,0,0.05)" };

function SectionTitle({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: string }) {
  return (
    <h3 onClick={onClick} style={{
      margin: "18px 0 10px", fontSize: 15, color: "#202124", borderBottom: "1px solid #e8eaed", paddingBottom: 8,
      display: "flex", alignItems: "center", justifyContent: "space-between", cursor: onClick ? "pointer" : "default", userSelect: "none",
    }}>
      <span>{children}</span>{right && <span style={{ fontSize: 12, color: "#80868b" }}>{right}</span>}
    </h3>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => <span style={{ fontSize: 11, fontWeight: 400, color: "#80868b" }}>{children}</span>;

// 같은 성격의 토글은 모두 같은 중립 스타일 + 켜짐/꺼짐 상태로만 구분 (색에 의미가 없으면 색을 쓰지 않음)
function ToggleBtn({ label, active, onClick, disabled, title }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-pressed={active} style={{
      flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, borderRadius: 6, transition: "all 0.15s",
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
      backgroundColor: active ? "#e8f0fe" : "#fff",
      color: active ? "#1967d2" : "#5f6368",
      border: `1px solid ${active ? "#aecbfa" : "#dadce0"}`,
    }}>{label}</button>
  );
}

function FitCard({ item, active, onHover, compact }: { item: FitItem; active: boolean; onHover: (id: PartId | null) => void; compact?: boolean }) {
  const c = LEVEL_COLOR[item.level];
  return (
    <div onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)} style={{
      borderRadius: 10, border: `1px solid ${active ? c : "#e8eaed"}`, borderLeft: `4px solid ${c}`,
      background: active ? `${c}0d` : "#fff", padding: compact ? "7px 10px" : "10px 12px", cursor: "default", transition: "all .12s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#202124" }}>{item.category}</span>
        {item.diffLabel && <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: c, fontVariantNumeric: "tabular-nums" }}>{item.diffLabel}</span>}
      </div>
      <p style={{ margin: "3px 0 0", fontSize: 12, color: "#5f6368", lineHeight: 1.5 }}>{item.message}</p>
    </div>
  );
}
