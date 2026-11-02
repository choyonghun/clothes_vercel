import React, { useId, useMemo, useState } from "react";
import { bodyGeometry } from "../fit/geometry";
import { DEFAULT_BODY } from "../fit/types";
import { frontBody } from "./bodyShapes";

// 입력 칸 옆 "?" 에 마우스를 올리면 어디를 재는지 작은 그림으로 보여줌.
// (예: 허벅지 "두께"를 반지름으로 오해해 6cm를 넣는 일을 막기 위해 둘레/단면 기준과 위치를 명시)

export type Diagram =
  | { kind: "body"; mark: "height" | "shoulder" | "arm" | "leg" | "chest" | "waist" | "hip" | "thigh" }
  | { kind: "top" | "pants" | "skirt" | "dress"; line: [number, number, number, number] };

export interface FieldSpec {
  key: string;
  label: string;
  desc: string;
  diagram: Diagram;
  /** 단면(반둘레) 값이면 둘레 환산값을 함께 보여줌 */
  flat?: boolean;
}

const ACCENT = "#1a73e8";

export const BODY_FIELDS: FieldSpec[] = [
  { key: "height", label: "키", desc: "맨발로 똑바로 선 상태에서 정수리부터 바닥까지", diagram: { kind: "body", mark: "height" } },
  { key: "shoulderWidth", label: "어깨 너비", desc: "한쪽 어깨 끝 뼈에서 반대쪽 끝까지 직선 거리. 옷의 '어깨 너비' 실측과 같은 기준입니다", diagram: { kind: "body", mark: "shoulder" } },
  { key: "armLength", label: "팔 길이", desc: "어깨 끝점에서 손목뼈까지 (팔을 자연스럽게 내린 상태)", diagram: { kind: "body", mark: "arm" } },
  { key: "legLength", label: "다리 길이 (안쪽)", desc: "가랑이에서 바닥까지. 바지 '안쪽 기장'과 비교합니다", diagram: { kind: "body", mark: "leg" } },
  { key: "chestCirc", label: "가슴 둘레", desc: "겨드랑이 바로 아래, 가슴의 가장 두꺼운 곳을 수평으로 한 바퀴", diagram: { kind: "body", mark: "chest" } },
  { key: "waistCirc", label: "허리 둘레", desc: "배꼽 위, 허리의 가장 잘록한 곳을 수평으로 한 바퀴", diagram: { kind: "body", mark: "waist" } },
  { key: "hipCirc", label: "엉덩이 둘레", desc: "엉덩이의 가장 튀어나온 곳을 수평으로 한 바퀴", diagram: { kind: "body", mark: "hip" } },
  { key: "thighCirc", label: "허벅지 둘레", desc: "가랑이 바로 아래, 허벅지의 가장 굵은 곳 한 바퀴 (성인 보통 45~65cm)", diagram: { kind: "body", mark: "thigh" } },
];

export const TOP_FIELDS: FieldSpec[] = [
  { key: "shoulder", label: "어깨 너비", desc: "옷을 평평하게 놓고 양쪽 어깨솔기 끝 사이 직선 거리", diagram: { kind: "top", line: [28, 13, 72, 13] } },
  { key: "chestWidth", label: "가슴 단면", desc: "평평하게 놓고 양쪽 겨드랑이 아래 끝 사이 거리. 둘레 = 단면 × 2", diagram: { kind: "top", line: [30, 33, 70, 33] }, flat: true },
  { key: "totalLength", label: "총장 (옆목점~밑단)", desc: "목둘레와 어깨솔기가 만나는 옆목점에서 밑단까지", diagram: { kind: "top", line: [60, 10, 60, 90] } },
  { key: "sleeveLength", label: "소매 길이 (솔기~끝)", desc: "어깨솔기 끝에서 소매 끝까지 (겨드랑이 기준 아님). 그래서 총장보다 길 수 있고, 옷 어깨가 좁으면 소매가 그만큼 안쪽에서 시작하므로 어깨와 함께 계산합니다", diagram: { kind: "top", line: [72, 13, 85.5, 37] } },
];

export const PANTS_FIELDS: FieldSpec[] = [
  { key: "pantsLength", label: "안쪽 기장", desc: "가랑이 봉제선에서 밑단까지 (인심). 쇼핑몰 '총장'은 허리부터 재는 값이라 다릅니다", diagram: { kind: "pants", line: [51.4, 40, 53, 94] } },
  { key: "waist", label: "허리 단면", desc: "평평하게 놓고 허리밴드 양 끝 사이 거리. 둘레 = 단면 × 2", diagram: { kind: "pants", line: [30, 9, 70, 9] }, flat: true },
  { key: "thighWidth", label: "허벅지 단면", desc: "가랑이 바로 아래에서 다리통 양 끝 사이 거리. 둘레 = 단면 × 2", diagram: { kind: "pants", line: [50.5, 41, 71.9, 41] }, flat: true },
  { key: "rise", label: "밑위", desc: "가랑이 봉제선에서 허리밴드 위까지 (앞 밑위, 보통 24~30cm)", diagram: { kind: "pants", line: [50, 38, 50, 8] } },
];

export const SKIRT_FIELDS: FieldSpec[] = [
  { key: "skirtLength", label: "치마 길이", desc: "허리밴드 위에서 밑단까지", diagram: { kind: "skirt", line: [50, 10, 50, 88] } },
  { key: "waist", label: "허리 단면", desc: "평평하게 놓고 허리밴드 양 끝 사이 거리. 둘레 = 단면 × 2", diagram: { kind: "skirt", line: [33, 11, 67, 11] }, flat: true },
];

export const DRESS_FIELDS: FieldSpec[] = [
  { key: "shoulder", label: "어깨 너비", desc: "옷을 평평하게 놓고 양쪽 어깨솔기 끝 사이 직선 거리", diagram: { kind: "dress", line: [32, 11, 68, 11] } },
  { key: "totalLength", label: "총장 (옆목점~밑단)", desc: "목둘레와 어깨솔기가 만나는 옆목점에서 밑단까지", diagram: { kind: "dress", line: [58, 8, 58, 92] } },
  { key: "sleeveLength", label: "소매 길이 (솔기~끝)", desc: "어깨솔기 끝에서 소매 끝까지", diagram: { kind: "dress", line: [68, 11, 76.5, 27.5] } },
  { key: "waist", label: "허리 단면", desc: "평평하게 놓고 허리선 양 끝 사이 거리. 둘레 = 단면 × 2", diagram: { kind: "dress", line: [36, 44, 64, 44] }, flat: true },
];

// 평평하게 놓은 옷 (실측 기준 그림)
const FLAT: Record<"top" | "pants" | "skirt" | "dress", { d: string; detail?: string }> = {
  top: { d: "M40,10 Q50,19 60,10 L72,13 L90,33 L81,41 L70,31 L70,90 L30,90 L30,31 L19,41 L10,33 L28,13 Z" },
  pants: { d: "M30,8 L70,8 L73,30 L69,94 L53,94 L50,38 L47,94 L31,94 L27,30 Z", detail: "M30.5,14 L69.5,14" },
  skirt: { d: "M33,10 L67,10 L80,88 L20,88 Z", detail: "M32,16 L68,16" },
  dress: { d: "M42,8 Q50,15 58,8 L68,11 L80,24 L73,31 L66,24 L64,44 L80,92 L20,92 L36,44 L34,24 L27,31 L20,24 L32,11 Z", detail: "M36,44 L64,44" },
};

function MeasureLine({ x1, y1, x2, y2, w }: { x1: number; y1: number; x2: number; y2: number; w: number }) {
  return <g stroke={ACCENT} strokeWidth={w} strokeLinecap="round">
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
    <circle cx={x1} cy={y1} r={w * 1.6} fill={ACCENT} stroke="none" />
    <circle cx={x2} cy={y2} r={w * 1.6} fill={ACCENT} stroke="none" />
  </g>;
}

function BodyDiagram({ mark }: { mark: Extract<Diagram, { kind: "body" }>["mark"] }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { g, fb } = useMemo(() => { const g = bodyGeometry(DEFAULT_BODY); return { g, fb: frontBody(g) }; }, []);
  const ring = (cx: number, y: number, rx: number) => (
    <ellipse cx={cx} cy={y} rx={rx} ry={2.4} fill="none" stroke={ACCENT} strokeWidth={1} />
  );
  const wrist = fb.arm.limb.at(fb.arm.sWrist).p;
  const overlay = {
    height: <MeasureLine x1={-40} y1={0} x2={-40} y2={g.H} w={0.9} />,
    shoulder: <MeasureLine x1={-g.sw / 2} y1={g.shoulderY} x2={g.sw / 2} y2={g.shoulderY} w={0.9} />,
    arm: <MeasureLine x1={g.sw / 2 + 2} y1={g.shoulderY} x2={wrist[0] + 3} y2={wrist[1]} w={0.9} />,
    leg: <MeasureLine x1={g.legCx0 * 0.3} y1={g.crotch} x2={g.legCx0 * 0.45} y2={0} w={0.9} />,
    chest: ring(0, g.chestY, g.frontOuter(g.chestY) + 1),
    waist: ring(0, g.waistY, g.frontOuter(g.waistY) + 1),
    hip: ring(0, g.hipY, g.frontOuter(g.hipY) + 1),
    thigh: ring(g.legCx(g.crotch - 4), g.crotch - 4, g.thighHalf + 1),
  }[mark];
  return (
    <svg viewBox={`-46 ${-g.H - 4} 92 ${g.H + 8}`} width={100} height={180}>
      <defs>
        <filter id={`${uid}-ol`} x="-10%" y="-5%" width="120%" height="110%">
          <feMorphology in="SourceAlpha" operator="dilate" radius={0.6} result="d" />
          <feComposite in="d" in2="SourceAlpha" operator="out" result="ring" />
          <feFlood floodColor="#a88a78" />
          <feComposite in2="ring" operator="in" />
        </filter>
      </defs>
      <g transform="scale(1,-1)">
        <g fill="#ecdcd0">{fb.parts.map((d, i) => <path key={i} d={d} />)}</g>
        <g filter={`url(#${uid}-ol)`}>{fb.parts.map((d, i) => <path key={i} d={d} />)}</g>
        {overlay}
      </g>
    </svg>
  );
}

export function DiagramView({ diagram }: { diagram: Diagram }) {
  if (diagram.kind === "body") return <BodyDiagram mark={diagram.mark} />;
  const shape = FLAT[diagram.kind];
  const [x1, y1, x2, y2] = diagram.line;
  return (
    <svg viewBox="0 0 100 100" width={130} height={130}>
      <path d={shape.d} fill="#f1f3f4" stroke="#9aa0a6" strokeWidth={0.8} strokeLinejoin="round" />
      {shape.detail && <path d={shape.detail} fill="none" stroke="#9aa0a6" strokeWidth={0.6} />}
      <MeasureLine x1={x1} y1={y1} x2={x2} y2={y2} w={1.3} />
    </svg>
  );
}

export function InfoHint({ spec }: { spec: FieldSpec }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <span tabIndex={0} aria-label={`${spec.label} 측정 방법`} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", width: 15, height: 15, borderRadius: 8,
        border: "1px solid #bdc1c6", color: "#80868b", fontSize: 10, fontWeight: 700, cursor: "help", marginLeft: 4,
      }}>?</span>
      {open && (
        <div role="tooltip" style={{
          position: "absolute", left: "calc(100% + 10px)", top: -12, zIndex: 30, width: 250,
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.14)",
          padding: 10, display: "flex", gap: 10, alignItems: "center", whiteSpace: "normal", fontWeight: 400, textAlign: "left", cursor: "default",
        }}>
          <div style={{ flex: "none" }}><DiagramView diagram={spec.diagram} /></div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "#3c4043" }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{spec.label}</div>
            {spec.desc}
          </div>
        </div>
      )}
    </span>
  );
}
