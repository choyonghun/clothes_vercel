import { bodyGeometry, BodyGeometry } from "./geometry";
import {
  Body, Dress, FitItem, Level, Outfit, Pants, PartId, Skirt, Top,
  DEFAULT_DRESS, DEFAULT_PANTS, DEFAULT_SKIRT, DEFAULT_TOP, withDefaults,
} from "./types";

// 핏 판정. 화면 그림(src/figure)과 같은 bodyGeometry 기준점을 쓰므로 판정과 그림이 서로 어긋나지 않음

/** 부호 있는 cm 표기 (마이너스는 하이픈 대신 − 기호) */
export function fmtCm(d: number) {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return "±0cm";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)}cm`;
}

/** 앞 밑위(곡선 길이) → 가랑이에서 허리밴드 위까지의 수직 높이 */
export const riseHeight = (rise: number) => rise * 0.85;

/** 소매끝이 어깨끝점에서 얼마나 내려오는지. 옷 어깨가 좁으면 소매가 그만큼 안쪽에서 시작하므로 화장(어깨+소매) 기준으로 계산 */
export const sleeveReach = (g: BodyGeometry, shoulder: number, sleeve: number) => shoulder / 2 + sleeve - g.sw / 2;

const SEVERITY: Record<Level, number> = { danger: 0, warning: 1, info: 2, ok: 3 };
export const bySeverity = (a: FitItem, b: FitItem) => SEVERITY[a.level] - SEVERITY[b.level];

type Add = (id: PartId, category: string, level: Level, message: string, diff?: number, diffLabel?: string) => void;

function shoulderFit(add: Add, id: PartId, g: BodyGeometry, shoulder: number) {
  const d = shoulder - g.b.shoulderWidth;
  const [level, msg]: [Level, string] =
      d < -3  ? ["danger",  "어깨가 매우 꽉 낍니다. 어깨솔기가 어깨끝보다 안쪽에 걸립니다"]
    : d < 0   ? ["warning", "어깨가 약간 꽉 낄 수 있습니다"]
    : d <= 5  ? ["ok",      "어깨 핏이 적당합니다"]
    : d <= 10 ? ["info",    "어깨가 넉넉합니다 (세미 오버핏)"]
    :           ["info",    "어깨선이 팔 쪽으로 많이 내려옵니다 (드롭숄더·오버핏)"];
  add(id, "어깨", level, msg, d, fmtCm(d));
}

function sleeveFit(add: Add, id: PartId, g: BodyGeometry, shoulder: number, sleeve: number) {
  const reach = sleeveReach(g, shoulder, sleeve);
  const d = reach - g.armLen;
  const note = " (어깨 너비 차이를 반영한 화장 기준)";
  if (reach < g.armLen * 0.5) return add(id, "소매", "info", "반팔 기장입니다", d, fmtCm(d));
  if (reach < g.armLen * 0.85) return add(id, "소매", "info", "7부 소매 기장입니다", d, fmtCm(d));
  const [level, msg]: [Level, string] =
      d < -5 ? ["warning", "소매가 많이 짧습니다"]
    : d < -2 ? ["info",    "소매가 약간 짧습니다"]
    : d <= 3 ? ["ok",      "소매 길이가 적당합니다"]
    : d <= 8 ? ["info",    "소매가 길어 손등을 덮습니다"]
    :          ["warning", "소매가 너무 깁니다"];
  add(id, "소매", level, msg + note, d, fmtCm(d));
}

/** 허리밴드가 놓이는 높이의 몸 둘레와 옷 허리 둘레(단면 × 2) 비교 */
function waistFit(add: Add, id: PartId, g: BodyGeometry, waistFlat: number, bandY: number) {
  const bodyCirc = g.circAt(bandY);
  const d = waistFlat * 2 - bodyCirc;
  const [level, msg]: [Level, string] =
      d < -2 ? ["danger",  "허리가 작아 잠기지 않을 수 있습니다"]
    : d < 0  ? ["warning", "허리가 약간 꽉 낄 수 있습니다"]
    : d <= 4 ? ["ok",      "허리 핏이 적당합니다"]
    :          ["info",    "허리가 커서 벨트가 필요합니다"];
  add(id, "허리", level, `${msg} (밴드 위치 몸 둘레 ${Math.round(bodyCirc)}cm · 옷 둘레 ${Math.round(waistFlat * 2)}cm)`, d, fmtCm(d));
}

/** 치마·원피스 밑단이 다리의 어디에 오는지 */
function hemLengthFit(add: Add, id: PartId, g: BodyGeometry, hemY: number, label: string) {
  const midThigh = g.crotch - (g.crotch - g.kneeY) * 0.4;
  const where = `밑단 높이 ${Math.round(hemY)}cm`;
  if (hemY < 0) return add(id, "기장", "warning", `${label}이(가) 바닥에 끌립니다`, hemY, where);
  if (hemY > g.crotch) return add(id, "기장", "warning", `${label}이(가) 짧아 엉덩이를 다 덮지 못합니다`, undefined, where);
  const [level, msg]: [Level, string] =
      hemY > midThigh       ? ["info", "미니 기장입니다"]
    : hemY > g.kneeY + 5    ? ["ok",   "무릎 위 기장입니다"]
    : hemY >= g.kneeY - 6   ? ["ok",   "무릎 기장입니다"]
    : hemY > g.ankleY + 12  ? ["ok",   "미디 기장입니다 (종아리)"]
    :                         ["ok",   "롱 기장입니다 (발목)"];
  add(id, "기장", level, msg, undefined, where);
}

export function analyzeOutfit(bodyIn: Partial<Body> | null | undefined, outfit: Outfit): FitItem[] {
  const items: FitItem[] = [];
  const add: Add = (id, category, level, message, diff, diffLabel) => items.push({ id, category, level, message, diff, diffLabel });
  const g = bodyGeometry(bodyIn);

  if (outfit.top) {
    const t: Top = withDefaults(outfit.top, DEFAULT_TOP);
    shoulderFit(add, "top.shoulder", g, t.shoulder);

    const ease = t.chestWidth * 2 - g.chestCirc;
    const [cl, cm]: [Level, string] =
        ease < 0   ? ["danger",  "가슴 둘레가 몸보다 작아 입기 어렵습니다"]
      : ease < 4   ? ["warning", "가슴이 꽉 낍니다"]
      : ease <= 14 ? ["ok",      "가슴 핏이 적당합니다"]
      : ease <= 24 ? ["info",    "가슴이 넉넉합니다 (루즈핏)"]
      :              ["info",    "가슴이 매우 넉넉합니다 (오버핏)"];
    add("top.chest", "가슴", cl, `${cm} (몸 ${Math.round(g.chestCirc)}cm · 옷 ${Math.round(t.chestWidth * 2)}cm)`, ease, ease >= 0 ? `여유 ${fmtCm(ease)}` : fmtCm(ease));

    sleeveFit(add, "top.sleeve", g, t.shoulder, t.sleeveLength);

    const hemY = g.neckBaseY - t.totalLength;
    const where = `밑단 높이 ${Math.round(hemY)}cm`;
    const [hl, hm]: [Level, string] =
        hemY > g.waistY + 2       ? ["info", "크롭 기장입니다 (허리 위)"]
      : hemY > g.hipY             ? ["ok",   "허리~골반 기장입니다"]
      : hemY > g.crotch - 8       ? ["ok",   "엉덩이를 덮는 기장입니다"]
      : hemY > (g.crotch + g.kneeY) / 2 ? ["info", "허벅지를 덮는 롱 기장입니다"]
      :                             ["info", "무릎 가까이 내려오는 아주 긴 기장입니다"];
    add("top.hem", "기장", hl, hm, undefined, where);
  }

  if (outfit.pants) {
    const p: Pants = withDefaults(outfit.pants, DEFAULT_PANTS);
    const d = p.pantsLength - g.crotch;
    const [ll, lm]: [Level, string] =
        p.pantsLength < g.crotch * 0.5 ? ["info", "반바지 기장입니다"]
      : d < -12 ? ["info",    "크롭 기장입니다 (발목이 드러남)"]
      : d < -4  ? ["info",    "발목 위로 살짝 올라오는 기장입니다"]
      : d <= 2  ? ["ok",      "바지 길이가 적당합니다"]
      : d <= 6  ? ["info",    "밑단이 신발 위에 살짝 쌓입니다"]
      :           ["warning", "바지가 길어 밑단이 끌릴 수 있습니다"];
    add("pants.length", "바지 기장", ll, lm, d, fmtCm(d));

    const bandY = g.crotch + riseHeight(p.rise);
    waistFit(add, "pants.waist", g, p.waist, bandY);

    const te = p.thighWidth * 2 - g.thighCirc;
    const [tl, tm]: [Level, string] =
        te < -4  ? ["danger",  "허벅지가 너무 작아 입기 어렵습니다"]
      : te < 0   ? ["warning", "허벅지가 꽉 낄 수 있습니다"]
      : te < 3   ? ["ok",      "허벅지가 슬림하게 맞습니다"]
      : te <= 10 ? ["ok",      "허벅지 핏이 적당합니다"]
      :            ["info",    "허벅지가 넉넉합니다 (와이드핏)"];
    add("pants.thigh", "허벅지", tl, `${tm} (몸 ${Math.round(g.thighCirc)}cm · 옷 ${Math.round(p.thighWidth * 2)}cm)`, te, fmtCm(te));

    const ratio = riseHeight(p.rise) / (g.waistY - g.crotch);
    const [rl, rm]: [Level, string] =
        ratio < 0.8  ? ["info", "로우라이즈 핏입니다 (골반에 걸쳐 입음)"]
      : ratio <= 1.1 ? ["ok",   "밑위 길이가 적당합니다"]
      :                ["info", "하이라이즈 핏입니다 (허리선 위로 올라옴)"];
    add("pants.rise", "밑위", rl, rm, bandY - g.waistY, `허리선 ${fmtCm(bandY - g.waistY)}`);
  }

  if (outfit.skirt) {
    const s: Skirt = withDefaults(outfit.skirt, DEFAULT_SKIRT);
    waistFit(add, "skirt.waist", g, s.waist, g.waistY);
    hemLengthFit(add, "skirt.length", g, skirtTopY(g) - s.skirtLength, "치마");
  }

  if (outfit.dress) {
    const d: Dress = withDefaults(outfit.dress, DEFAULT_DRESS);
    shoulderFit(add, "dress.shoulder", g, d.shoulder);
    sleeveFit(add, "dress.sleeve", g, d.shoulder, d.sleeveLength);
    waistFit(add, "dress.waist", g, d.waist, g.waistY);
    hemLengthFit(add, "dress.length", g, g.neckBaseY - d.totalLength, "원피스");
  }

  return items;
}

/** 치마 허리밴드 윗선 (자연 허리선보다 살짝 위) */
export const skirtTopY = (g: BodyGeometry) => g.waistY + 1.5;
