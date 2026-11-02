import React, { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { bodyGeometry } from "../fit/geometry";
import { Body, Dress, FitItem, Level, Pants, PartId, Skirt, Top } from "../fit/types";
import { frontBody, sideBody } from "./bodyShapes";
import { GarmentShape, dressShape, pantsShape, skirtShape, topShape } from "./garmentShapes";
import { Pt } from "./path";

// 정면·측면 2뷰 핏 다이어그램.
// 몸(살색 실루엣) 위에 옷 외곽선을 겹쳐 "간격"을 보여줌. 몸 윤곽선은 옷 위에도 그려서
// 옷 선과 몸 선 사이 거리가 곧 여유(바깥) 또는 조임(안쪽)으로 읽히게 함

export const LEVEL_COLOR: Record<Level, string> = {
  danger: "#d93025", warning: "#e37400", info: "#1a73e8", ok: "#188038",
};

const SKIN = "#ecdcd0";
const SKIN_LINE = "#a88a78";

export interface FitFigureProps {
  body: Body;
  outfit: { top?: Top | null; pants?: Pants | null; skirt?: Skirt | null; dress?: Dress | null };
  colors: { top: string; pants: string; skirt: string; dress: string };
  items: FitItem[];
  focus: PartId | null;
  onFocus: (id: PartId | null) => void;
}

interface Layer { key: string; color: string; shape: GarmentShape }

export default function FitFigure({ body, outfit, colors, items, focus, onFocus }: FitFigureProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const scene = useMemo(() => {
    const g = bodyGeometry(body);
    const fb = frontBody(g), sb = sideBody(g);
    const layers: Layer[] = [];
    // 그리는 순서 = 겹치는 순서 (하의 위에 상의를 빼 입은 모양)
    if (outfit.pants) layers.push({ key: "pants", color: colors.pants, shape: pantsShape(g, outfit.pants) });
    if (outfit.skirt) layers.push({ key: "skirt", color: colors.skirt, shape: skirtShape(g, outfit.skirt) });
    if (outfit.dress) layers.push({ key: "dress", color: colors.dress, shape: dressShape(g, fb.arm, sb.arm, outfit.dress) });
    if (outfit.top) layers.push({ key: "top", color: colors.top, shape: topShape(g, fb.arm, sb.arm, outfit.top) });
    return { g, fb, sb, layers };
  }, [body, outfit, colors]);

  const { g, fb, sb, layers } = scene;
  const top = Math.max(200, g.H + 14), bottom = -8;
  const fW = Math.max(44, fb.maxX + 8);
  const front = { x0: -fW - 12, x1: fW };
  const side = { x0: Math.min(sb.minX, -24) - 10, x1: Math.max(sb.maxX, 26) + 10 };
  const viewH = top - bottom;

  const itemById = new Map(items.map((i) => [i.id, i]));
  const anchorsOf = (view: "front" | "side") => {
    const out: { id: PartId; p: Pt; item: FitItem }[] = [];
    for (const l of layers) {
      for (const [id, p] of Object.entries(l.shape[view].anchors) as [PartId, Pt][]) {
        const item = itemById.get(id);
        if (item && p) out.push({ id, p, item });
      }
    }
    return out;
  };

  // 포커스된 부위의 툴팁 위치 (정면 뷰의 점을 우선 사용)
  useLayoutEffect(() => {
    if (!focus || !wrapRef.current) { setTip(null); return; }
    const el = wrapRef.current.querySelector(`[data-hot="${focus}"]`);
    if (!el) { setTip(null); return; }
    const r = el.getBoundingClientRect(), w = wrapRef.current.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2 - w.left, y: r.top - w.top });
  }, [focus, scene]);

  const focusItem = focus ? itemById.get(focus) : undefined;

  // 필터는 정면 SVG에만 한 번 정의 (같은 문서 안이라 측면 SVG에서도 url(#id)로 참조됨, id 중복 방지)
  const defs = (
    <defs>
      {/* 가장자리를 살짝 어둡게(오른쪽 아래) / 밝게(왼쪽 위) 해서 평면 실루엣에 볼륨감을 줌 */}
      <filter id={`${uid}-shade`} x="-10%" y="-5%" width="120%" height="110%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b" />
        <feOffset in="b" dx="-1.3" dy="1.1" result="o1" />
        <feComposite in="SourceAlpha" in2="o1" operator="arithmetic" k2="1" k3="-1" result="rim1" />
        <feFlood floodColor="#8f6b57" floodOpacity="0.5" />
        <feComposite in2="rim1" operator="in" result="shadow" />
        <feOffset in="b" dx="1.2" dy="-1" result="o2" />
        <feComposite in="SourceAlpha" in2="o2" operator="arithmetic" k2="1" k3="-1" result="rim2" />
        <feFlood floodColor="#ffffff" floodOpacity="0.45" />
        <feComposite in2="rim2" operator="in" result="light" />
        <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="shadow" /><feMergeNode in="light" /></feMerge>
      </filter>
      {/* 여러 조각(몸통·팔·머리)을 하나로 합친 바깥 윤곽선만 남김 → 조각 사이 이음매가 보이지 않음 */}
      {[["body", SKIN_LINE, 0.28], ...layers.map((l) => [l.key, l.color, 0.42])].map(([key, color, r]) => (
        <filter key={key as string} id={`${uid}-ol-${key}`} x="-10%" y="-5%" width="120%" height="110%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={r as number} result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="ring" />
          <feFlood floodColor={color as string} />
          <feComposite in2="ring" operator="in" />
        </filter>
      ))}
    </defs>
  );

  const paths = (ds: string[], props: React.SVGProps<SVGPathElement> = {}) =>
    ds.map((d, i) => <path key={i} d={d} {...props} />);

  const garmentFill = (v: (s: GarmentShape) => string[]) =>
    layers.map((l) => <g key={l.key} fill={l.color} opacity={0.17}>{paths(v(l.shape))}</g>);
  const garmentOutline = (v: (s: GarmentShape) => string[]) =>
    layers.map((l) => <g key={l.key} filter={`url(#${uid}-ol-${l.key})`}>{paths(v(l.shape))}</g>);
  const garmentDetails = (v: (s: GarmentShape) => string[]) =>
    layers.map((l) => (
      <g key={l.key} fill="none" stroke={l.color} strokeWidth={0.3} strokeOpacity={0.75} strokeLinecap="round">{paths(v(l.shape))}</g>
    ));

  const hotspots = (view: "front" | "side") => anchorsOf(view).map(({ id, p, item }) => {
    const c = LEVEL_COLOR[item.level];
    const x = p[0], y = -p[1];
    const active = focus === id;
    const showBadge = view === "front" && (item.level === "danger" || item.level === "warning") && item.diffLabel;
    const label = item.diffLabel || "";
    const bw = label.length * 1.9 + 2.6, dir = x < 0 ? -1 : 1, bx = x + dir * 3.2;
    return (
      <g key={id} data-hot={view === "front" ? id : undefined} style={{ cursor: "pointer" }}
         onMouseEnter={() => onFocus(id)} onMouseLeave={() => onFocus(null)}>
        <circle cx={x} cy={y} r={5} fill="transparent" />
        {active && <circle className="fit-hot-ring" cx={x} cy={y} r={3.6} fill="none" stroke={c} strokeWidth={0.6} />}
        <circle cx={x} cy={y} r={active ? 2 : 1.6} fill={c} stroke="#fff" strokeWidth={0.5} />
        {showBadge && (
          <g>
            <rect x={dir > 0 ? bx : bx - bw} y={y - 2.3} width={bw} height={4.6} rx={2.3} fill={c} />
            <text x={dir > 0 ? bx + bw / 2 : bx - bw / 2} y={y + 1.05} fontSize={3} fontWeight={700} fill="#fff" textAnchor="middle">{label}</text>
          </g>
        )}
      </g>
    );
  });

  const refs = (pts: Pt[]) => pts.map((p, i) => (
    <circle key={i} cx={p[0]} cy={p[1]} r={0.75} fill="#fff" stroke={SKIN_LINE} strokeWidth={0.35} />
  ));

  const floorShadow = <ellipse cx={0} cy={0} rx={g.legCx0 + 9} ry={1.8} fill="#000" opacity={0.07} />;
  const svgStyle: React.CSSProperties = { width: "100%", height: "100%", display: "block", overflow: "visible" };
  const rulerTop = Math.ceil(g.H / 10) * 10;

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 8 }}>
        {/* ── 정면 ── */}
        <div style={{ flex: `${front.x1 - front.x0} 1 0`, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={caption}>정면</div>
          <svg viewBox={`${front.x0} ${-top} ${front.x1 - front.x0} ${viewH}`} preserveAspectRatio="xMidYMax meet" style={svgStyle}>
            {defs}
            {/* 키 눈금 */}
            <g stroke="#dadce0" strokeWidth={0.25}>
              <line x1={front.x0 + 5} x2={front.x0 + 5} y1={0} y2={-rulerTop} />
              {Array.from({ length: rulerTop / 10 + 1 }, (_, i) => i * 10).map((v) => (
                <line key={v} x1={front.x0 + 5} x2={front.x0 + (v % 50 === 0 ? 8 : 6.5)} y1={-v} y2={-v} />
              ))}
            </g>
            {Array.from({ length: Math.floor(rulerTop / 50) + 1 }, (_, i) => i * 50).map((v) => (
              <text key={v} x={front.x0 + 9} y={-v + 1} fontSize={2.8} fill="#9aa0a6">{v}</text>
            ))}
            <line x1={front.x0} x2={front.x1} y1={0} y2={0} stroke="#e8eaed" strokeWidth={0.4} />
            <text x={0} y={-g.H - 4} fontSize={3.2} fill="#80868b" textAnchor="middle">{Math.round(g.H)}cm</text>
            <g transform="scale(1,-1)">
              {floorShadow}
              <g fill={SKIN} filter={`url(#${uid}-shade)`}>{paths(fb.parts)}</g>
              <g fill="none" stroke={SKIN_LINE} strokeWidth={0.22} strokeOpacity={0.45} strokeLinecap="round">{paths(fb.details)}</g>
              {garmentFill((s) => s.front.fills)}
              <g filter={`url(#${uid}-ol-body)`}>{paths(fb.parts)}</g>
              {garmentOutline((s) => s.front.fills)}
              {garmentDetails((s) => s.front.details)}
              {layers.map((l) => <g key={l.key}>{refs(l.shape.front.refs)}</g>)}
            </g>
            {hotspots("front")}
          </svg>
        </div>

        {/* ── 측면 ── */}
        <div style={{ flex: `${side.x1 - side.x0} 1 0`, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={caption}>측면</div>
          <svg viewBox={`${side.x0} ${-top} ${side.x1 - side.x0} ${viewH}`} preserveAspectRatio="xMidYMax meet" style={svgStyle}>
            <line x1={side.x0} x2={side.x1} y1={0} y2={0} stroke="#e8eaed" strokeWidth={0.4} />
            <g transform="scale(1,-1)">
              <ellipse cx={g.H * 0.04} cy={0} rx={g.H * 0.09} ry={1.8} fill="#000" opacity={0.07} />
              <g fill={SKIN} filter={`url(#${uid}-shade)`}>{paths(sb.parts)}</g>
              {garmentFill((s) => s.side.fills)}
              <g filter={`url(#${uid}-ol-body)`}>{paths(sb.parts)}</g>
              {garmentOutline((s) => s.side.fills)}
              {garmentDetails((s) => s.side.details)}
              <g fill="none" stroke={SKIN_LINE} strokeWidth={0.25} strokeOpacity={0.6}>{paths(sb.details)}</g>
              {/* 앞에 있는 팔은 몸통 위에 따로 그려야 윤곽이 보임 */}
              <g fill={SKIN} filter={`url(#${uid}-shade)`}><path d={sb.armPart} /></g>
              <g filter={`url(#${uid}-ol-body)`}><path d={sb.armPart} /></g>
              {garmentFill((s) => s.side.sleeves)}
              {garmentOutline((s) => s.side.sleeves)}
            </g>
            {hotspots("side")}
          </svg>
        </div>
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center", fontSize: 11.5, color: "#5f6368", padding: "10px 0 2px" }}>
        <span><Swatch fill={SKIN} stroke={SKIN_LINE} /> 몸</span>
        <span><Swatch fill="transparent" stroke="#5f6368" thick /> 옷 외곽선 (몸 선과의 간격 = 여유)</span>
        {(["danger", "warning", "info", "ok"] as Level[]).map((l) => (
          <span key={l}><Dot c={LEVEL_COLOR[l]} /> {{ danger: "맞지 않음", warning: "주의", info: "참고", ok: "적정" }[l]}</span>
        ))}
      </div>

      {tip && focusItem && (
        <div style={{
          position: "absolute", left: tip.x, top: tip.y - 10, transform: "translate(-50%, -100%)",
          background: "#202124", color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12, lineHeight: 1.45,
          maxWidth: 240, boxShadow: "0 6px 18px rgba(0,0,0,.18)", pointerEvents: "none", zIndex: 5,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
            <Dot c={LEVEL_COLOR[focusItem.level]} />{focusItem.category}
            {focusItem.diffLabel && <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{focusItem.diffLabel}</span>}
          </div>
          <div style={{ color: "#dadce0", marginTop: 2 }}>{focusItem.message}</div>
        </div>
      )}
    </div>
  );
}

const caption: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#80868b", textAlign: "center", marginBottom: 4 };

function Dot({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: c, verticalAlign: "middle" }} />;
}

function Swatch({ fill, stroke, thick }: { fill: string; stroke: string; thick?: boolean }) {
  return <span style={{ display: "inline-block", width: 14, height: 10, borderRadius: 3, background: fill, border: `${thick ? 2 : 1}px solid ${stroke}`, verticalAlign: "middle" }} />;
}
