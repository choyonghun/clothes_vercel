import { BodyGeometry, clamp, spline } from "../fit/geometry";
import { Limb, Pt, mirrorClose, mirrorX, range, smoothPath } from "./path";

// 사람 형태의 마네킹 윤곽. 얼굴은 그리지 않음(눈만 찍힌 얼굴은 오히려 어색하므로 매장 마네킹처럼 비워 둠)

const deg = (d: number) => (d * Math.PI) / 180;
const down = (angleDeg: number): Pt => [Math.sin(deg(angleDeg)), -Math.cos(deg(angleDeg))];
const add = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];

// ─── 정면 팔 ──────────────────────────────────────────────────
export type ArmModel = ReturnType<typeof frontArm>;

export function frontArm(g: BodyGeometry) {
  const { sw, rU, shoulderY, armLen, handLen, H } = g;
  // 어깨 관절 중심: 어깨끝점보다 위팔 반지름만큼 안쪽·아래
  const J: Pt = [sw / 2 - rU * 0.45, shoulderY - rU * 0.85];
  const sWrist = armLen - rU * 0.85;
  // 팔을 몸통에서 살짝 띄운 A자 자세. 손목이 골반·허벅지에 파묻히지 않을 만큼만 벌림
  const wristY = J[1] - sWrist;
  const need = g.frontOuter(clamp(wristY, g.ankleY, g.armpitY)) + rU * 0.6 + 1.5 - J[0];
  const th = clamp((Math.asin(clamp(need / sWrist, -1, 1)) * 180) / Math.PI, 10, 24);
  const Lu = sWrist * 0.55, Lf = sWrist - Lu;
  const E = add(J, down(th), Lu);
  const W = add(E, down(th + 4), Lf);          // 아래팔은 바깥으로 살짝 (운반각)
  const Tip = add(W, down(th + 1), handLen);
  const limb = new Limb([J, E, W, Tip]);
  const sTip = limb.length;
  const hw = H * 0.0185;                         // 손 반폭 (키에 비례)
  const h = handLen;
  const rOut = spline([
    [0, 1.0 * rU], [0.22 * Lu, 1.06 * rU], [0.55 * Lu, 0.95 * rU], [Lu, 0.8 * rU],
    [Lu + 0.25 * Lf, 0.84 * rU], [Lu + 0.7 * Lf, 0.62 * rU], [sWrist, 0.52 * rU],
    [sWrist + 0.15 * h, hw * 0.92], [sWrist + 0.45 * h, hw * 1.0], [sWrist + 0.75 * h, hw * 0.8],
    [sWrist + 0.93 * h, hw * 0.5], [sTip, 0.15],
  ]);
  const rIn = spline([
    [0, 0.9 * rU], [0.55 * Lu, 0.88 * rU], [Lu, 0.8 * rU], [Lu + 0.25 * Lf, 0.8 * rU],
    [Lu + 0.7 * Lf, 0.6 * rU], [sWrist, 0.5 * rU],
    [sWrist + 0.3 * h, hw * 1.05], [sWrist + 0.55 * h, hw * 0.92], [sWrist + 0.8 * h, hw * 0.7],
    [sWrist + 0.95 * h, hw * 0.42], [sTip, 0.15],
  ]);
  // 안쪽선이 겨드랑이 높이에 닿는 지점 (그 위는 몸통에 붙어 보이지 않음)
  const sArmpit = clamp((J[1] - g.armpitY) / Math.cos(deg(th)), 1, Lu * 0.6);
  return { J, th, Lu, Lf, sWrist, sTip, limb, rOut, rIn, sArmpit, wrist: W };
}

function frontArmOutline(g: BodyGeometry, a: ArmModel): Pt[] {
  const { sw, rU, shoulderY } = g;
  return [
    g.trapezius(0.7), g.trapezius(0.86), [sw / 2, shoulderY],
    [sw / 2 + 0.3 * rU, shoulderY - 0.12 * rU],           // 어깨를 둥글게 (삼각근)
    [sw / 2 + 0.5 * rU, shoulderY - 0.4 * rU],
    ...a.limb.side(0, a.sTip - 0.4, a.rOut, 1, 1.2),
    a.limb.at(a.sTip).p,
    ...a.limb.side(a.sTip - 0.4, a.sArmpit, a.rIn, -1, 1.2),
    [a.J[0] - rU * 0.9, g.armpitY + rU * 0.6],
  ];
}

// ─── 정면 몸통·다리·발 ─────────────────────────────────────────
function frontTorsoRight(g: BodyGeometry): Pt[] {
  const { neckHalf: n, chinY, head, neckBaseY, armpitY, ankleY, crotch, H, ankleHalf } = g;
  const cx = g.legCx(ankleY);
  const fo = H * 0.033, fi = H * 0.024;
  return [
    [n * 0.86, chinY + head * 0.25],
    [n * 0.92, chinY - head * 0.15],
    [n, neckBaseY + 0.6],
    ...range(0.1, 1, 1 / 9).map((u) => g.trapezius(u)),
    [g.chestHalf * 0.98, armpitY + 1.2],
    ...range(armpitY, ankleY, 1).map((y) => [g.frontOuter(y), y] as Pt),
    // 발 (정면에서 보면 발등과 발가락이 살짝 바깥을 향함)
    [cx + ankleHalf * 1.15 + 0.4, ankleY * 0.55],
    [cx + fo, ankleY * 0.22],
    [cx + fo * 0.9, 0.25],
    [cx + fo * 0.55, 0],
    [cx - fi * 0.4, 0],
    [cx - fi * 0.9, 0.25],
    [cx - fi, ankleY * 0.3],
    [cx - ankleHalf * 1.15, ankleY * 0.75],
    ...range(ankleY, crotch - 0.8, 1).map((y) => [g.frontInner(y), y] as Pt),
    [0, crotch + 0.5],
  ];
}

function frontHead(g: BodyGeometry): Pt[] {
  const { H, head: h } = g;
  const right: Pt[] = [
    [0, H], [0.19 * h, H - 0.05 * h], [0.31 * h, H - 0.2 * h], [0.345 * h, H - 0.4 * h],
    [0.325 * h, H - 0.6 * h], [0.27 * h, H - 0.77 * h], [0.17 * h, H - 0.92 * h], [0.06 * h, H - 0.995 * h],
  ];
  return [...right, [0, H - h], ...mirrorX(right.slice(1)).reverse()];
}

export function frontBody(g: BodyGeometry) {
  const arm = frontArm(g);
  const armR = frontArmOutline(g, arm);
  const { H, head: h } = g;
  const ear = (side: number) => smoothPath([
    [side * 0.33 * h, H - 0.44 * h], [side * 0.375 * h, H - 0.47 * h], [side * 0.38 * h, H - 0.56 * h],
    [side * 0.35 * h, H - 0.63 * h], [side * 0.31 * h, H - 0.6 * h],
  ]);
  return {
    arm,
    parts: [
      smoothPath(mirrorClose(frontTorsoRight(g))),
      smoothPath(armR),
      smoothPath(mirrorX(armR)),
      smoothPath(frontHead(g)),
      ear(1), ear(-1),
    ],
    // 쇄골처럼 아주 옅은 디테일 선 (평평한 실루엣이 덜 단조롭게)
    details: [
      smoothPath([[g.neckHalf * 0.6, g.neckBaseY - h * 0.2], [g.sw * 0.2, g.shoulderY + g.slope * 0.05], [g.sw * 0.38, g.shoulderY + 0.2]], false),
      smoothPath([[-g.neckHalf * 0.6, g.neckBaseY - h * 0.2], [-g.sw * 0.2, g.shoulderY + g.slope * 0.05], [-g.sw * 0.38, g.shoulderY + 0.2]], false),
    ],
    maxX: Math.max(...armR.map((p) => p[0])),
  };
}

// ─── 측면 ─────────────────────────────────────────────────────
export type SideArmModel = ReturnType<typeof sideArm>;

export function sideArm(g: BodyGeometry) {
  const { rU, shoulderY, armLen, handLen, H } = g;
  const J: Pt = [-0.6, shoulderY - rU * 0.85];
  const sWrist = armLen - rU * 0.85;
  const Lu = sWrist * 0.55, Lf = sWrist - Lu;
  // 방향각: +가 앞쪽. 위팔은 거의 수직, 아래팔은 살짝 앞으로
  const E = add(J, down(-3), Lu);
  const W = add(E, down(9), Lf);
  const Tip = add(W, down(5), handLen);
  const limb = new Limb([J, E, W, Tip]);
  const sTip = limb.length, hw = H * 0.0185, h = handLen;
  const rFront = spline([
    [0, 0.9 * rU], [0.35 * Lu, 0.95 * rU], [Lu, 0.68 * rU], [Lu + 0.2 * Lf, 0.8 * rU], [sWrist, 0.48 * rU],
    [sWrist + 0.3 * h, hw * 1.4], [sWrist + 0.6 * h, hw * 1.25], [sWrist + 0.85 * h, hw * 0.85], [sTip, 0.2],
  ]);
  const rBack = spline([
    [0, 0.95 * rU], [0.4 * Lu, 1.0 * rU], [Lu, 0.72 * rU], [Lu + 0.3 * Lf, 0.74 * rU], [sWrist, 0.45 * rU],
    [sWrist + 0.3 * h, hw * 1.0], [sWrist + 0.6 * h, hw * 1.0], [sWrist + 0.85 * h, hw * 0.7], [sTip, 0.2],
  ]);
  return { J, Lu, Lf, sWrist, sTip, limb, rFront, rBack };
}

export function sideArmOutline(a: SideArmModel, rU: number, ease = 0, s1 = a.sTip): Pt[] {
  const [x, y] = a.J, r = rU + ease;
  const end = Math.min(s1, a.sTip);
  return [
    [x - r * 1.0, y], [x - r * 0.72, y + r * 0.72], [x, y + r * 0.98], [x + r * 0.7, y + r * 0.7],
    ...a.limb.side(0, end - (end === a.sTip ? 0.4 : 0), (s) => a.rFront(s) + ease, 1, 1.2),
    ...(end === a.sTip ? [a.limb.at(a.sTip).p] : []),
    ...a.limb.side(end - (end === a.sTip ? 0.4 : 0), 0, (s) => a.rBack(s) + ease, -1, 1.2),
  ];
}

function sideHead(g: BodyGeometry): Pt[] {
  const { H, head: h } = g;
  const l = h * 0.86, c = 1.0;
  return [
    [c + 0.05 * l, H], [c + 0.33 * l, H - 0.07 * h], [c + 0.47 * l, H - 0.28 * h], [c + 0.5 * l, H - 0.44 * h],
    [c + 0.48 * l, H - 0.62 * h], [c + 0.45 * l, H - 0.8 * h], [c + 0.4 * l, H - 0.95 * h],
    [c + 0.28 * l, H - 1.0 * h], [c + 0.08 * l, H - 0.95 * h], [c - 0.12 * l, H - 0.8 * h],
    [c - 0.38 * l, H - 0.8 * h], [c - 0.52 * l, H - 0.55 * h], [c - 0.47 * l, H - 0.25 * h], [c - 0.27 * l, H - 0.06 * h],
  ];
}

export function sideBody(g: BodyGeometry) {
  const { chinY, ankleY, H, head: h } = g;
  const fl = H * 0.15;
  const ankleFront = g.sideFront(ankleY), ankleBack = g.sideBack(ankleY);
  const torso: Pt[] = [
    ...range(chinY + 2.5, ankleY, 1).map((y) => [g.sideFront(y), y] as Pt),
    [ankleFront + 1.6, ankleY * 0.72],
    [fl * 0.45, ankleY * 0.42],
    [fl * 0.7, ankleY * 0.2],
    [fl * 0.76, 0.6],
    [fl * 0.72, 0],
    [-fl * 0.2, 0],
    [-fl * 0.25, ankleY * 0.35],
    [ankleBack - 0.4, ankleY * 0.8],
    ...range(ankleY, chinY + 2.5, 1).map((y) => [g.sideBack(y), y] as Pt),
  ];
  const arm = sideArm(g);
  const l = h * 0.86, c = 1.0;
  return {
    arm,
    parts: [smoothPath(torso), smoothPath(sideHead(g))],
    armPart: smoothPath(sideArmOutline(arm, g.rU)),
    // 귀 (옆모습이 사람처럼 보이게 하는 최소한의 단서)
    details: [smoothPath([
      [c - 0.02 * l, H - 0.45 * h], [c - 0.12 * l, H - 0.44 * h], [c - 0.17 * l, H - 0.52 * h],
      [c - 0.13 * l, H - 0.62 * h], [c - 0.04 * l, H - 0.6 * h],
    ], false)],
    minX: Math.min(-fl * 0.3, ...range(0, H, 5).map((y) => g.sideBack(y))),
    maxX: Math.max(fl * 0.8, ...range(0, H, 5).map((y) => g.sideFront(y))),
  };
}
