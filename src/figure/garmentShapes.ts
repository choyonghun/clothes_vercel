import { BodyGeometry, clamp, lerp, smoothstep, spline } from "../fit/geometry";
import { riseHeight, skirtTopY, sleeveReach } from "../fit/analyze";
import { Dress, Pants, PartId, Skirt, Top } from "../fit/types";
import { ArmModel, SideArmModel, sideArmOutline } from "./bodyShapes";
import { Pt, mirrorClose, range, smoothPath } from "./path";

// 옷 외곽선. 옷을 몸 위에 "예쁘게 입히는" 대신, 몸 윤곽과 겹쳐서 간격(여유/조임)이 보이게 하는 것이 목적.
// 규칙: 옷 둘레 ÷ 몸 둘레 = 비율(r). 화면의 옷 폭 = 몸 폭 × r
//  → r < 1(작은 옷)이면 외곽선이 몸 안쪽으로 들어가 "조인다"가 그대로 보이고, r > 1이면 그만큼 떠 보임.
//  치수가 없는 부분(소매통, 엉덩이 등)은 몸 + 일정 여유로만 그려 근거 없는 핏을 암시하지 않음

export type Anchors = Partial<Record<PartId, Pt>>;

export interface GarmentView {
  fills: string[];
  details: string[];
  anchors: Anchors;
  /** 비교 기준이 되는 몸의 점 (어깨끝점, 손목 등) */
  refs: Pt[];
}

export interface GarmentShape {
  front: GarmentView;
  side: GarmentView & { sleeves: string[] };
}

/**
 * 천이 몸의 오목한 곳(허리, 엉덩이 아래 등)을 메우며 걸치는 모양.
 * 창 크기 w 안의 최댓값(팽창) → 이동평균. 결과는 항상 원래 윤곽 이상이라 몸을 뚫지 않음
 */
function drape(f: (y: number) => number, lo: number, hi: number, w: (y: number) => number, sign: 1 | -1 = 1) {
  const step = 0.5, pad = 16;
  const ys = range(lo - pad, hi + pad, step);
  const v = ys.map((y) => f(y) * sign);
  const win = (i: number, r: number, src: number[], op: (vals: number[]) => number) => {
    const k = Math.max(0, Math.round(r / step));
    return op(src.slice(Math.max(0, i - k), Math.min(src.length, i + k + 1)));
  };
  const dil = v.map((_, i) => win(i, w(ys[i]), v, (a) => Math.max(...a)));
  const avg = dil.map((_, i) => win(i, w(ys[i]) / 2, dil, (a) => a.reduce((s, x) => s + x, 0) / a.length));
  const y0 = ys[0], dy = ys[1] - ys[0];
  return (y: number) => {
    const t = clamp((y - y0) / dy, 0, ys.length - 1), i = Math.min(ys.length - 2, Math.floor(t));
    return lerp(avg[i], avg[i + 1], t - i) * sign;
  };
}

// ─── 상의형 (상의 / 원피스 상체) ───────────────────────────────
interface TopLikeOpts {
  shoulder: number;
  sleeveLength: number;
  hemY: number;
  ratio: (y: number) => number;      // 높이별 옷/몸 비율
  extra?: (y: number) => number;     // 치마 퍼짐 등 추가 폭
  drapeW: (y: number) => number;
}

function topLike(g: BodyGeometry, arm: ArmModel, sArm: SideArmModel, o: TopLikeOpts) {
  const { sw, rU, neckHalf: n, neckBaseY, head, shoulderY, chestY } = g;
  const extra = o.extra || (() => 0);
  const hemY = Math.min(o.hemY, g.armpitY - 4);

  // 정면 몸통 폭
  const dr = drape(g.frontOuter, hemY, g.armpitY, o.drapeW);
  const gHalf = (y: number) => dr(Math.min(y, g.armpitY)) * o.ratio(y) + extra(y);

  // 어깨솔기 끝(S): 옷 어깨가 몸보다 좁으면 어깨끝점 안쪽, 넓으면 팔 쪽으로 처져 내려감
  const cs2 = o.shoulder / 2, LIFT = 0.45;
  const shoulderPts: Pt[] = range(n + 0.5, Math.min(cs2, sw / 2), 1).map((x) => [x, g.shoulderLineY(x) + LIFT] as Pt);
  let S: Pt;
  if (cs2 > sw / 2) {
    const excess = cs2 - sw / 2, ex = Math.min(excess, 0.5 * rU + 1.2);
    shoulderPts.push([sw / 2 + ex * 0.55, shoulderY - excess * 0.25 + LIFT]);
    S = [sw / 2 + ex, shoulderY - excess * 0.8 + LIFT];
  } else S = [cs2, g.shoulderLineY(cs2) + LIFT];
  const tight = o.shoulder < g.b.shoulderWidth;

  // 소매: 팔 중심선을 따라 팔 두께 + 여유. 소매통 치수는 없으므로 여유는 고정값 (어깨가 끼면 거의 붙게)
  const e = tight ? 0.4 : 1.3;
  const sEnd = clamp(sleeveReach(g, o.shoulder, o.sleeveLength) - 0.85 * rU, 2, arm.sTip - 1);
  const cosT = Math.cos((arm.th * Math.PI) / 180);
  const sOut0 = clamp((arm.J[1] - S[1]) / cosT, 0, sEnd - 1);
  const outer = arm.limb.side(sOut0, sEnd, (s) => arm.rOut(s) + e, 1, 1.2);
  // 소매 안쪽선이 몸판 옆선과 만나는 곳(겨드랑이 아래 봉제선)을 찾음
  const innerAt = (s: number) => arm.limb.offset(s, arm.rIn(s) + e, -1);
  let sMeet = sEnd;
  for (let s = arm.sArmpit; s <= sEnd; s += 0.5) {
    const p = innerAt(s);
    if (p[0] >= gHalf(p[1])) { sMeet = s; break; }
  }
  const inner = range(sEnd, sMeet, 1.2).map(innerAt);
  const meetY = innerAt(sMeet)[1];

  const right: Pt[] = [
    [0, neckBaseY - head * 0.32],
    [n * 0.75, neckBaseY - head * 0.22],
    ...shoulderPts,
    S,
    ...outer,
    ...inner,
    ...range(Math.min(meetY, g.armpitY) - 1, hemY + 0.5, 1).map((y) => [gHalf(y), y] as Pt),
    [gHalf(hemY), hemY],
    [gHalf(hemY) * 0.5, hemY - 0.25],
    [0, hemY - 0.3],
  ];

  // 측면: 앞/뒤 윤곽을 같은 비율로. 가슴 위는 비율 효과를 어깨 쪽으로 갈수록 줄여 목이 부풀지 않게
  const dF = drape(g.sideFront, hemY, chestY, o.drapeW, 1);
  const dB = drape(g.sideBack, hemY, chestY, o.drapeW, -1);
  const fade = (y: number) => 1 - smoothstep((y - chestY) / (neckBaseY - chestY));
  const sideEdge = (y: number, base: (y: number) => number, dd: (y: number) => number, sign: 1 | -1) => {
    if (y <= chestY) return dd(y) * o.ratio(y) + sign * extra(y) * 0.9;
    const atChest = dd(chestY) * o.ratio(chestY) + sign * extra(chestY) * 0.9;
    return base(y) + sign * 0.4 + (atChest - base(chestY) - sign * 0.4) * fade(y);
  };
  const gF = (y: number) => sideEdge(y, g.sideFront, dF, 1);
  const gB = (y: number) => sideEdge(y, g.sideBack, dB, -1);
  const yFn = neckBaseY - head * 0.32, yBn = neckBaseY - 1;
  const side: Pt[] = [
    [-0.8, neckBaseY + 0.7],
    [g.sideBack(yBn) - 0.3, yBn],
    ...range(yBn - 1.5, hemY + 0.5, 1).map((y) => [gB(y), y] as Pt),
    [gB(hemY), hemY], [gF(hemY), hemY],
    ...range(hemY + 0.5, yFn - 1.5, 1).map((y) => [gF(y), y] as Pt),
    [g.sideFront(yFn) + 0.3, yFn],
    [g.sideFront(yFn) * 0.45, neckBaseY - head * 0.08],
  ];
  const sSide = clamp(sleeveReach(g, o.shoulder, o.sleeveLength) - 0.85 * rU, 2, sArm.sTip - 1);

  const shape: GarmentShape = {
    front: {
      fills: [smoothPath(mirrorClose(right))],
      details: [],
      anchors: {},
      // 비교 기준점: 어깨끝점(어깨솔기와 비교), 긴소매일 때 손목(소매끝과 비교)
      refs: sEnd > arm.Lu ? [[sw / 2, shoulderY], arm.limb.at(arm.sWrist).p] : [[sw / 2, shoulderY]],
    },
    side: {
      fills: [smoothPath(side)],
      sleeves: [smoothPath(sideArmOutline(sArm, rU, e, sSide))],
      details: [],
      anchors: {},
      refs: [],
    },
  };
  return { shape, gHalf, gF, S, cuff: arm.limb.at(sEnd).p, cuffSide: sArm.limb.at(sSide).p, hemY };
}

export function topShape(g: BodyGeometry, arm: ArmModel, sArm: SideArmModel, t: Top): GarmentShape {
  const rc = (t.chestWidth * 2) / g.chestCirc;
  // 넉넉한 옷일수록 몸의 굴곡을 덜 따라감 (박시)
  const w = clamp(3 + 25 * Math.max(0, rc - 1), 3, 10);
  const r = topLike(g, arm, sArm, {
    shoulder: t.shoulder, sleeveLength: t.sleeveLength, hemY: g.neckBaseY - t.totalLength,
    ratio: () => rc, drapeW: () => w,
  });
  r.shape.front.anchors = {
    "top.shoulder": r.S,
    "top.chest": [-r.gHalf(g.chestY), g.chestY],
    "top.sleeve": r.cuff,
    "top.hem": [-r.gHalf(r.hemY) * 0.55, r.hemY],
  };
  r.shape.side.anchors = { "top.chest": [r.gF(g.chestY), g.chestY], "top.hem": [r.gF(r.hemY), r.hemY], "top.sleeve": r.cuffSide };
  return r.shape;
}

export function dressShape(g: BodyGeometry, arm: ArmModel, sArm: SideArmModel, d: Dress): GarmentShape {
  const rw = (d.waist * 2) / g.waistCirc;
  const { chestY, waistY, hipY } = g;
  // 가슴 치수가 없으므로 상체는 몸 + 기본 여유(6%), 허리선에서 원피스 허리 치수 비율로 좁혀짐
  const ratio = (y: number) =>
    y >= waistY ? lerp(rw, 1.06, smoothstep((y - waistY) / (chestY - waistY)))
    : lerp(rw, Math.max(rw, 1) + 0.03, smoothstep((waistY - y) / 6));
  const r = topLike(g, arm, sArm, {
    shoulder: d.shoulder, sleeveLength: d.sleeveLength, hemY: g.neckBaseY - d.totalLength,
    ratio, extra: (y) => 0.13 * Math.max(0, hipY - y), drapeW: (y) => lerp(2, 12, smoothstep((hipY + 4 - y) / 8)),
  });
  r.shape.front.anchors = {
    "dress.shoulder": r.S,
    "dress.sleeve": r.cuff,
    "dress.waist": [-r.gHalf(waistY), waistY],
    "dress.length": [r.gHalf(r.hemY) * 0.6, r.hemY],
  };
  r.shape.front.details = [smoothPath([[-r.gHalf(waistY), waistY], [0, waistY - 0.4], [r.gHalf(waistY), waistY]], false)];
  r.shape.side.anchors = { "dress.length": [r.gF(r.hemY), r.hemY], "dress.sleeve": r.cuffSide };
  return r.shape;
}

// ─── 하의 공통: 허리밴드 아래 엉덩이 구간 비율 ──────────────────
// 밴드 자체는 치수 비율(작으면 몸 안쪽), 그 아래로 5cm에 걸쳐 몸 + 여유로 넘어감
const hipZoneRatio = (rw: number, bandBottom: number) => (y: number) =>
  lerp(rw, Math.max(rw, 1) + 0.02, smoothstep((bandBottom - y) / 5));

export function pantsShape(g: BodyGeometry, p: Pants): GarmentShape {
  const { crotch, frontOuter } = g;
  const bandY = crotch + riseHeight(p.rise);
  const BAND = 3.8;
  const rw = (p.waist * 2) / g.circAt(bandY);
  const rt = (p.thighWidth * 2) / g.thighCirc;
  const hemY = Math.max(0, crotch - p.pantsLength);
  const zr = hipZoneRatio(rw, bandY - BAND);

  const drH = drape(frontOuter, crotch, bandY, () => 3);
  const hipHalf = (y: number) => drH(y) * zr(y) + 0.5 * smoothstep((bandY - BAND - y) / 5);
  // 다리 중심은 해부학적 중심선(legCx). 허벅지가 붙어 안쪽선이 가운데로 눌린 윤곽의 중점을 쓰면 바지통이 안쪽으로 쏠림
  const legC = g.legCx;
  const legH = (y: number) => frontOuter(y) - legC(y);
  // 바지통: 허벅지(치수) → 무릎(허벅지의 약 70%) → 밑단. 일반 청바지 패턴의 비율이며,
  // 무릎·밑단 치수는 입력받지 않으므로 몸보다 좁아지지는 않게만 함
  const thighG = g.thighHalf * rt + (rt >= 1 ? 0.4 : 0);
  const kneeG = Math.max(g.kneeHalf + 0.8, thighG * 0.7);
  const hemG = Math.max(g.ankleHalf * 1.4 + 2.2, thighG * 0.62);
  const taper = spline([[0, hemG], [g.kneeY, kneeG], [crotch, thighG]]);
  const legG = (y: number) => Math.max(taper(y), (legH(y) + 0.5) * Math.min(1, rt));
  const hipAtCrotch = hipHalf(crotch);
  const outerX = (y: number) => {
    const leg = legC(y) + legG(y);
    return Math.max(leg, lerp(hipAtCrotch, leg, smoothstep((crotch - y) / 8)));
  };
  const innerX = (y: number) => Math.max(0, legC(y) - legG(y));

  const right: Pt[] = [
    [0, bandY], [hipHalf(bandY), bandY],
    ...range(bandY - 0.5, crotch, 1).map((y) => [hipHalf(y), y] as Pt),
    ...range(crotch - 1, hemY + 0.5, 1.5).map((y) => [outerX(y), y] as Pt),
    [outerX(hemY), hemY], [innerX(hemY), hemY],
    ...range(hemY + 1, crotch - 2, 1.5).map((y) => [innerX(y), y] as Pt),
    [0, crotch - 1.2],
  ];
  const bandLine = smoothPath([[-hipHalf(bandY - BAND), bandY - BAND], [0, bandY - BAND - 0.2], [hipHalf(bandY - BAND), bandY - BAND]], false);
  const fly = smoothPath([[0, bandY - BAND], [0, crotch + 5], [2.2, crotch + 3.2], [3.2, bandY - BAND - 2]], false);
  // 바지가 다리보다 길면 밑단이 바닥에서 접혀 쌓이는 주름을 그림 (끌림 경고와 같은 근거)
  const excess = p.pantsLength - crotch;
  const stack = excess > 2 ? [0, 1, 2].slice(0, excess > 8 ? 3 : 2).flatMap((i) => {
    const y = 2.5 + i * 3.2;
    return [1, -1].map((k) => smoothPath([
      [k * innerX(y) + k * 0.6, y + 0.6], [k * legC(y), y - 0.5], [k * outerX(y) - k * 0.6, y + 0.8],
    ], false));
  }) : [];

  // 측면
  const { sideFront, sideBack } = g;
  const dF = drape(sideFront, hemY, bandY, (y) => (y < crotch + 6 ? 6 : 2.5), 1);
  const dB = drape(sideBack, hemY, bandY, (y) => (y < crotch + 10 ? 7 : 2.5), -1);
  const thighF = (g.thighD / 2) * rt + 0.3;
  const sideTaper = spline([[0, hemG * 1.05], [g.kneeY, kneeG * 1.02], [crotch, thighF]]);
  const ease = (y: number) => 0.5 * smoothstep((bandY - BAND - y) / 5);
  const gF = (y: number) => Math.max(dF(y) * (y < crotch ? Math.min(1, rt) : zr(y)) + ease(y), y < crotch ? sideTaper(y) : -1e9);
  const gB = (y: number) => Math.min(dB(y) * (y < crotch ? Math.min(1, rt) : zr(y)) - ease(y), y < crotch ? -sideTaper(y) : 1e9);
  const side: Pt[] = [
    [gF(bandY), bandY],
    ...range(bandY - 0.5, hemY + 0.5, 1).map((y) => [gF(y), y] as Pt),
    [gF(hemY), hemY], [gB(hemY), hemY],
    ...range(hemY + 0.5, bandY - 0.5, 1).map((y) => [gB(y), y] as Pt),
    [gB(bandY), bandY],
  ];

  return {
    front: {
      fills: [smoothPath(mirrorClose(right))],
      details: [bandLine, fly, ...stack],
      anchors: {
        "pants.waist": [-hipHalf(bandY), bandY - BAND / 2],
        "pants.rise": [0, (bandY - BAND + crotch) / 2],
        "pants.thigh": [-outerX(crotch - 5), crotch - 5],
        "pants.length": [outerX(hemY), hemY],
      },
      refs: [],
    },
    side: {
      fills: [smoothPath(side)],
      sleeves: [],
      details: [smoothPath([[gB(bandY - BAND), bandY - BAND], [gF(bandY - BAND), bandY - BAND]], false)],
      anchors: { "pants.rise": [gF(bandY), bandY], "pants.length": [gF(hemY), hemY] },
      refs: [],
    },
  };
}

export function skirtShape(g: BodyGeometry, s: Skirt): GarmentShape {
  const topY = skirtTopY(g), BAND = 3.5;
  const hemY = Math.max(0, topY - s.skirtLength);
  const rw = (s.waist * 2) / g.waistCirc;
  const zr = hipZoneRatio(rw, topY - BAND);
  const FLARE = 0.14;
  const flare = (y: number) => FLARE * Math.max(0, g.hipY - y);
  const w = (y: number) => lerp(2.5, 12, smoothstep((g.hipY + 2 - y) / 8));
  const dr = drape(g.frontOuter, hemY, topY, w);
  const bandHalf = dr(topY) * rw;
  const half = (y: number) => Math.max(dr(y) * zr(y) + 0.8 * smoothstep((topY - BAND - y) / 5) + flare(y), y > topY - BAND ? 0 : bandHalf);
  const right: Pt[] = [
    [0, topY], [half(topY), topY],
    ...range(topY - 0.5, hemY + 0.5, 1).map((y) => [half(y), y] as Pt),
    [half(hemY), hemY], [half(hemY) * 0.5, hemY - 0.4], [0, hemY - 0.5],
  ];
  const fold = (k: number) => smoothPath([[k * half(g.hipY) * 0.45, g.hipY - 3], [k * half(hemY) * 0.55, hemY + 1]], false);

  const dF = drape(g.sideFront, hemY, topY, w, 1);
  const dB = drape(g.sideBack, hemY, topY, w, -1);
  const gF = (y: number) => dF(y) * zr(y) + 0.6 * smoothstep((topY - BAND - y) / 5) + flare(y) * 0.8;
  const gB = (y: number) => dB(y) * zr(y) - 0.6 * smoothstep((topY - BAND - y) / 5) - flare(y) * 0.8;
  const side: Pt[] = [
    [gF(topY), topY], ...range(topY - 0.5, hemY + 0.5, 1).map((y) => [gF(y), y] as Pt),
    [gF(hemY), hemY], [gB(hemY), hemY], ...range(hemY + 0.5, topY - 0.5, 1).map((y) => [gB(y), y] as Pt), [gB(topY), topY],
  ];
  return {
    front: {
      fills: [smoothPath(mirrorClose(right))],
      details: [smoothPath([[-half(topY - BAND), topY - BAND], [half(topY - BAND), topY - BAND]], false), fold(1), fold(-1)],
      anchors: { "skirt.waist": [-half(topY), topY - BAND / 2], "skirt.length": [half(hemY) * 0.7, hemY] },
      refs: [],
    },
    side: {
      fills: [smoothPath(side)], sleeves: [], refs: [],
      details: [smoothPath([[gB(topY - BAND), topY - BAND], [gF(topY - BAND), topY - BAND]], false)],
      anchors: { "skirt.length": [gF(hemY), hemY] },
    },
  };
}
