import { Body, DEFAULT_BODY, withDefaults } from "./types";

// ─── 입력 치수 → 신체 형상 ────────────────────────────────────
// 모든 좌표는 cm, y는 바닥(0)에서 위로. 화면 그림과 핏 판정이 같은 값을 쓰도록 여기서 한 번만 계산함
// (그림과 판정이 다른 공식을 쓰면 "꽉 낀다"고 하면서 그림은 헐렁한 모순이 생김)

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** 반축 비율이 1 : k 인 타원의 둘레 (Ramanujan 근사) */
const perimeter = (k: number) => Math.PI * (3 * (1 + k) - Math.sqrt((3 + k) * (1 + 3 * k)));
/** 둘레 → 정면 폭. 단면을 두께/폭 = k 인 타원으로 보고 계산 */
export const widthFromCirc = (circ: number, k: number) => (2 * circ) / perimeter(k);

/**
 * 단조 3차 보간 (Fritsch–Carlson). 지정한 점들 사이에서 튀어나가는(overshoot) 일이 없어서
 * 허리처럼 가장 좁은 곳이 의도보다 더 파이거나, 엉덩이가 입력보다 넓어지는 일이 생기지 않음
 */
export function spline(knots: [number, number][]): (t: number) => number {
  const ks = [...knots].sort((a, b) => a[0] - b[0])
    .filter((k, i, arr) => i === 0 || k[0] - arr[i - 1][0] > 0.05);
  const n = ks.length;
  if (n === 1) return () => ks[0][1];
  const xs = ks.map((k) => k[0]), ys = ks.map((k) => k[1]);
  const d: number[] = [], m: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i]
         + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export type BodyGeometry = ReturnType<typeof bodyGeometry>;

export function bodyGeometry(input?: Partial<Body> | null) {
  const b = withDefaults(input, DEFAULT_BODY);
  const H = clamp(b.height, 60, 230);

  // ── 세로 기준점 ──
  // 성인은 7.5두신, 어린이일수록 머리가 커짐 (128cm ≈ 6두신, 100cm ≈ 5두신)
  const heads = clamp(4.2 + (H - 75) * 3.3 / 90, 4.2, 7.5);
  const head = H / heads;
  const chinY = H - head;
  const shoulderY = chinY - head * 0.42;           // 어깨끝점(견봉) 높이 ≈ 키의 81%
  const slope = head * 0.22;                       // 목 → 어깨끝점 사이 승모근 경사 높이
  const neckBaseY = shoulderY + slope;             // 옆목점(HPS) 높이 — 상의 총장의 기준점
  const neckHalf = head * 0.25;
  // 다리 길이 입력이 몸통을 침범하지 않도록 (몸통은 최소 키의 27%)
  const crotch = clamp(b.legLength, H * 0.3, shoulderY - H * 0.27);
  const T = shoulderY - crotch;
  const armpitY = shoulderY - head * 0.45;
  const chestY = Math.min(crotch + 0.72 * T, armpitY - head * 0.12);
  const waistY = crotch + 0.40 * T;
  const hipY = crotch + 0.13 * T;
  const kneeY = crotch * 0.6;
  const ankleY = H * 0.04;

  // ── 굵기: 둘레 → 정면 폭 / 측면 두께 ──
  const sw = clamp(b.shoulderWidth, H * 0.15, H * 0.36);
  const chestCirc = clamp(b.chestCirc, 40, 200);
  const waistCirc = clamp(b.waistCirc, 35, 200);
  const hipCirc = clamp(b.hipCirc, 40, 200);
  const thighCirc = clamp(b.thighCirc, 20, 120);
  const kC = 0.72;
  // 허리가 엉덩이에 가까울수록(배가 나올수록) 허리 단면이 둥글어짐
  const kW = clamp(0.7 + 0.8 * Math.max(0, waistCirc / hipCirc - 0.84), 0.7, 0.98);
  const kH = 0.74, kT = 0.92;
  const chestHalf = widthFromCirc(chestCirc, kC) / 2;
  const waistHalf = widthFromCirc(waistCirc, kW) / 2;
  const hipHalf = widthFromCirc(hipCirc, kH) / 2;
  const thighHalf = widthFromCirc(thighCirc, kT) / 2;
  const chestD = chestHalf * 2 * kC, waistD = waistHalf * 2 * kW, hipD = hipHalf * 2 * kH, thighD = thighHalf * 2 * kT;
  const kneeHalf = Math.max(thighHalf * 0.58, H * 0.03);
  const calfHalf = thighHalf * 0.68;
  const ankleHalf = Math.max(thighHalf * 0.36, H * 0.018);
  const kneeD = kneeHalf * 2, calfD = calfHalf * 2.1, ankleD = ankleHalf * 2.3;
  const rU = (chestCirc * 0.32) / (2 * Math.PI);   // 위팔 반지름

  // ── 팔 ──
  const armLen = clamp(b.armLength, H * 0.2, H * 0.5);
  const handLen = H * 0.105;

  // ── 다리 중심선 (가랑이에서 발목으로 살짝 벌어짐) ──
  const legCx0 = Math.max(hipHalf * 0.5, thighHalf * 0.85);
  const legCx1 = legCx0 + 0.8;
  const legCx = (y: number) => lerp(legCx0, legCx1, clamp((crotch - y) / (crotch - ankleY), 0, 1));
  const kc = crotch - kneeY, ka = kneeY - ankleY;

  // ── 정면 윤곽 (오른쪽 반, x ≥ 0) ──
  // 바깥선: 겨드랑이 → 가슴 → 허리 → 엉덩이 → 허벅지 → 무릎 → 종아리 → 발목을 하나의 곡선으로
  const frontOuter = spline([
    [armpitY, chestHalf * 0.96],
    [chestY, chestHalf],
    [waistY, waistHalf],
    [hipY, hipHalf],
    [crotch, Math.max(hipHalf * 0.985, legCx0 + thighHalf * 0.97)],
    [crotch - 0.25 * kc, legCx(crotch - 0.25 * kc) + thighHalf * 0.9],
    [kneeY + 0.2 * kc, legCx(kneeY + 0.2 * kc) + thighHalf * 0.68],
    [kneeY, legCx(kneeY) + kneeHalf],
    [kneeY - 0.28 * ka, legCx(kneeY - 0.28 * ka) + calfHalf * 0.9],
    [ankleY + 0.25 * ka, legCx(ankleY + 0.25 * ka) + ankleHalf * 1.35],
    [ankleY, legCx(ankleY) + ankleHalf * 1.05],
  ]);
  // 안쪽선: 가랑이 → 안쪽 허벅지 → 무릎 → 종아리 → 안쪽 복사뼈. 허벅지가 붙는 체형은 가운데에 얇은 틈만 남김
  const GAP = 0.22;
  const inner = (y: number, v: number) => [y, Math.max(GAP, v)] as [number, number];
  const frontInner = spline([
    [crotch, GAP],
    inner(crotch - 0.12 * kc, legCx(crotch - 0.12 * kc) - thighHalf * 0.86),
    inner(crotch - 0.45 * kc, legCx(crotch - 0.45 * kc) - thighHalf * 0.7),
    inner(kneeY + 0.12 * kc, legCx(kneeY + 0.12 * kc) - kneeHalf * 1.02),
    inner(kneeY, legCx(kneeY) - kneeHalf * 0.98),
    inner(kneeY - 0.3 * ka, legCx(kneeY - 0.3 * ka) - calfHalf * 0.96),
    inner(ankleY + 0.18 * ka, legCx(ankleY + 0.18 * ka) - ankleHalf * 1.18),
    inner(ankleY, legCx(ankleY) - ankleHalf * 1.1),
  ]);

  // ── 측면 윤곽 (x > 0 이 앞) ──
  const belly = waistD * 0.5 * (kW - 0.7) * 1.4;
  const sideFront = spline([
    [ankleY, ankleD * 0.5],
    [ankleY + 0.25 * ka, ankleD * 0.55],
    [kneeY - 0.3 * ka, calfD * 0.36],
    [kneeY, kneeD * 0.5],
    [kneeY + 0.22 * kc, thighD * 0.43],
    [crotch - 0.22 * kc, thighD * 0.5],
    [crotch + 0.5 * (hipY - crotch), thighD * 0.5 + 0.35 * (waistD * 0.48 + belly - thighD * 0.5)],
    [(hipY + waistY) / 2, waistD * 0.47 + belly * 0.9],
    [waistY, waistD * 0.48 + belly],
    [chestY, chestD * 0.52],
    [armpitY, chestD * 0.46],
    [shoulderY - head * 0.12, chestD * 0.3],
    [neckBaseY - 1, head * 0.21],
    [chinY + 2.5, head * 0.12],
  ]);
  const sideBack = spline([
    [ankleY, -ankleD * 0.5],
    [ankleY + 0.18 * ka, -ankleD * 0.42],
    [kneeY - 0.3 * ka, -calfD * 0.6],
    [kneeY, -kneeD * 0.58],
    [kneeY + 0.25 * kc, -thighD * 0.48],
    [crotch - 1.5, -thighD * 0.58],
    [hipY - 1.5, -hipD * 0.53],
    [(hipY + waistY) / 2, -(hipD * 0.53 + waistD * 0.42) / 2 - 0.4],
    [waistY, -waistD * 0.42],
    [chestY, -chestD * 0.48],
    [armpitY + head * 0.1, -chestD * 0.47],
    [shoulderY, -chestD * 0.36],
    [neckBaseY - 1, -head * 0.3],
    [chinY + 2.5, -head * 0.22],
  ]);

  /** 높이 y에서 몸의 둘레 (허리밴드가 골반에 걸치면 허리 둘레가 아니라 그 높이의 둘레와 비교해야 함) */
  const circAt = (y: number) =>
    y >= chestY ? chestCirc
    : y >= waistY ? lerp(waistCirc, chestCirc, (y - waistY) / (chestY - waistY))
    : y >= hipY ? lerp(hipCirc, waistCirc, (y - hipY) / (waistY - hipY))
    : hipCirc;

  /** 승모근 곡선: 옆목점 → 어깨끝점 (u: 0~1) */
  const trapezius = (u: number): [number, number] =>
    [neckHalf + (sw / 2 - neckHalf) * u, shoulderY + slope * Math.pow(1 - u, 1.35)];
  /** x 위치의 어깨선 높이 */
  const shoulderLineY = (x: number) => trapezius(clamp((x - neckHalf) / (sw / 2 - neckHalf), 0, 1))[1];

  return {
    b, H, head, heads, chinY, shoulderY, slope, neckBaseY, neckHalf, crotch, armpitY, chestY, waistY, hipY, kneeY, ankleY,
    sw, chestCirc, waistCirc, hipCirc, thighCirc, chestHalf, waistHalf, hipHalf, thighHalf, kneeHalf, calfHalf, ankleHalf,
    chestD, waistD, hipD, thighD, rU, armLen, handLen, legCx, legCx0,
    frontOuter, frontInner, sideFront, sideBack, circAt, trapezius, shoulderLineY,
  };
}
