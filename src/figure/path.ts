// SVG 경로 유틸. 좌표는 cm, y는 위쪽이 + (그리는 쪽에서 scale(1,-1)로 뒤집음)

export type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const f = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * 점들을 지나는 매끄러운 곡선 (centripetal Catmull-Rom → 3차 베지어).
 * centripetal 방식은 점 간격이 고르지 않아도 고리(loop)나 뾰족한 튐이 생기지 않음
 */
export function smoothPath(input: Pt[], closed = true): string {
  const pts = input.filter((p, i) => i === 0 || dist(p, input[i - 1]) > 0.02);
  if (closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 0.02) pts.pop();
  const n = pts.length;
  if (n < 2) return "";
  const at = (i: number) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const d1 = Math.sqrt(dist(p0, p1)), d2 = Math.sqrt(dist(p1, p2)), d3 = Math.sqrt(dist(p2, p3));
    let c1: Pt = p1, c2: Pt = p2;
    if (d1 > 1e-6) {
      const k = 3 * d1 * (d1 + d2);
      c1 = [(d1 * d1 * p2[0] - d2 * d2 * p0[0] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[0]) / k,
            (d1 * d1 * p2[1] - d2 * d2 * p0[1] + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1[1]) / k];
    } else c1 = [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3];
    if (d3 > 1e-6) {
      const k = 3 * d3 * (d3 + d2);
      c2 = [(d3 * d3 * p1[0] - d2 * d2 * p3[0] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[0]) / k,
            (d3 * d3 * p1[1] - d2 * d2 * p3[1] + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2[1]) / k];
    } else c2 = [p2[0] - (p2[0] - p1[0]) / 3, p2[1] - (p2[1] - p1[1]) / 3];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return closed ? d + "Z" : d;
}

export const linePath = (pts: Pt[], closed = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${f(p[0])},${f(p[1])}`).join("") + (closed ? "Z" : "");

/** 오른쪽 반쪽 윤곽(위→아래→가운데)을 좌우 대칭으로 이어 닫힌 윤곽으로 */
export const mirrorClose = (right: Pt[]): Pt[] => [...right, ...right.slice().reverse().map(([x, y]) => [-x, y] as Pt)];

export const mirrorX = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [-x, y] as Pt);

/** a부터 b까지 step 간격 (끝점 포함) */
export function range(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * (i / n));
}

/**
 * 팔·소매처럼 굽은 중심선을 따라 두께가 변하는 형상.
 * axis: 중심선 꺾은선, rOut/rIn: 중심선에서 바깥/안쪽까지 거리(s = 중심선 시작부터의 길이)
 */
export class Limb {
  private segs: { a: Pt; dir: Pt; len: number; s0: number }[] = [];
  readonly length: number;
  constructor(axis: Pt[]) {
    let s = 0;
    for (let i = 0; i < axis.length - 1; i++) {
      const a = axis[i], b = axis[i + 1], len = dist(a, b);
      this.segs.push({ a, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len, s0: s });
      s += len;
    }
    this.length = s;
  }
  /** 위치와 방향. 관절 부근 ±blend 구간에서 방향을 섞어 꺾인 곳이 각지지 않게 함 */
  at(s: number, blend = 3): { p: Pt; dir: Pt } {
    const segs = this.segs;
    let i = segs.findIndex((g) => s <= g.s0 + g.len);
    if (i < 0) i = segs.length - 1;
    const g = segs[i];
    const t = s - g.s0;
    const p: Pt = [g.a[0] + g.dir[0] * t, g.a[1] + g.dir[1] * t];
    let dir = g.dir;
    const mix = (d1: Pt, d2: Pt, w: number): Pt => {
      const x = d1[0] * (1 - w) + d2[0] * w, y = d1[1] * (1 - w) + d2[1] * w, l = Math.hypot(x, y);
      return [x / l, y / l];
    };
    if (i < segs.length - 1 && g.len - t < blend) dir = mix(g.dir, segs[i + 1].dir, 0.5 * (1 - (g.len - t) / blend));
    else if (i > 0 && t < blend) dir = mix(segs[i - 1].dir, g.dir, 0.5 + 0.5 * (t / blend));
    return { p, dir };
  }
  /** side: +1 = 진행 방향의 왼쪽 법선(오른팔 기준 바깥), −1 = 안쪽 */
  offset(s: number, r: number, side: 1 | -1): Pt {
    const { p, dir } = this.at(s);
    // 아래로 향하는 진행 방향 (dx, dy)에서 왼쪽 법선은 (−dy, dx) … 오른팔이면 바깥(+x)이 됨
    return [p[0] - dir[1] * r * side, p[1] + dir[0] * r * side];
  }
  side(s0: number, s1: number, r: (s: number) => number, side: 1 | -1, step = 1): Pt[] {
    return range(s0, s1, step).map((s) => this.offset(s, r(s), side));
  }
}
