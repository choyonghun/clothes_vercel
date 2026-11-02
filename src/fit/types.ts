// 클라이언트(React)와 서버(Vercel 함수)가 함께 쓰는 치수 정의.
// DOM/Node 전용 API를 쓰지 않아야 양쪽 tsconfig에서 모두 컴파일됨
//
// 측정 기준 (기준축을 섞지 않기 위한 약속)
// - 신체: 너비·길이는 직선 거리, 굵기는 "둘레"(줄자로 한 바퀴)
// - 의류: 평평하게 놓고 잰 "실측". 가슴·허리·허벅지는 단면(반둘레)이라 내부에서 둘레 = 단면 × 2 로 정규화
// - 어깨 너비는 신체(어깨끝점~어깨끝점)와 의류(어깨솔기~어깨솔기)가 같은 축이라 그대로 비교

export interface Body {
  height: number;        // 키
  shoulderWidth: number; // 어깨 너비 (어깨끝점 사이 직선)
  armLength: number;     // 팔 길이 (어깨끝점 → 손목)
  legLength: number;     // 다리 길이 (가랑이 → 바닥, 안쪽)
  chestCirc: number;     // 가슴 둘레
  waistCirc: number;     // 허리 둘레
  hipCirc: number;       // 엉덩이 둘레
  thighCirc: number;     // 허벅지 둘레
}

export interface Top {
  shoulder: number;      // 어깨 너비 실측 (솔기~솔기)
  chestWidth: number;    // 가슴 단면 (겨드랑이~겨드랑이)
  totalLength: number;   // 총장 (옆목점 → 밑단)
  sleeveLength: number;  // 소매 길이 (어깨솔기 → 소매끝)
}

export interface Pants {
  pantsLength: number;   // 안쪽 기장 (가랑이 → 밑단)
  waist: number;         // 허리 단면
  thighWidth: number;    // 허벅지 단면
  rise: number;          // 앞 밑위 (가랑이 → 허리밴드 위)
}

export interface Skirt {
  skirtLength: number;   // 치마 길이 (허리밴드 위 → 밑단)
  waist: number;         // 허리 단면
}

export interface Dress {
  shoulder: number;
  totalLength: number;   // 총장 (옆목점 → 밑단)
  sleeveLength: number;
  waist: number;         // 허리 단면
}

export interface Outfit {
  top?: Top | null;
  pants?: Pants | null;
  skirt?: Skirt | null;
  dress?: Dress | null;
}

export type Level = "ok" | "info" | "warning" | "danger";

/** 화면의 부위 표시(hotspot)와 핏 가이드 카드를 잇는 키 */
export type PartId =
  | "top.shoulder" | "top.chest" | "top.sleeve" | "top.hem"
  | "pants.waist" | "pants.rise" | "pants.thigh" | "pants.length"
  | "skirt.waist" | "skirt.length"
  | "dress.shoulder" | "dress.sleeve" | "dress.waist" | "dress.length";

export interface FitItem {
  id: PartId;
  category: string;
  message: string;
  level: Level;
  /** 옷 − 몸 (cm). 길이 분류처럼 차이로 표현하기 어려운 항목은 없음 */
  diff?: number;
  /** 화면에 그대로 보여줄 짧은 수치 ("−5cm", "여유 +9cm") */
  diffLabel?: string;
}

export const DEFAULT_BODY: Body = {
  height: 175, shoulderWidth: 45, armLength: 60, legLength: 80,
  chestCirc: 95, waistCirc: 80, hipCirc: 95, thighCirc: 55,
};
export const DEFAULT_TOP: Top = { shoulder: 46, chestWidth: 52, totalLength: 70, sleeveLength: 61 };
export const DEFAULT_PANTS: Pants = { pantsLength: 80, waist: 41, thighWidth: 30, rise: 27 };
export const DEFAULT_SKIRT: Skirt = { skirtLength: 55, waist: 41 };
export const DEFAULT_DRESS: Dress = { shoulder: 44, totalLength: 105, sleeveLength: 58, waist: 42 };

export const BODY_PRESETS: Record<string, Body> = {
  마른:   { height: 175, shoulderWidth: 41, armLength: 60, legLength: 81, chestCirc: 86,  waistCirc: 70,  hipCirc: 88,  thighCirc: 48 },
  평균:   { ...DEFAULT_BODY },
  통통한: { height: 175, shoulderWidth: 49, armLength: 61, legLength: 78, chestCirc: 110, waistCirc: 100, hipCirc: 108, thighCirc: 64 },
};

/** 0·빈값·숫자가 아닌 값이면 기본값 (입력 중인 빈 칸 때문에 그림이 무너지지 않도록) */
export function pos(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function withDefaults<T extends object>(v: Partial<Record<keyof T, unknown>> | null | undefined, d: T): T {
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof T)[]) (out as any)[k] = pos(v?.[k], d[k] as unknown as number);
  return out;
}
