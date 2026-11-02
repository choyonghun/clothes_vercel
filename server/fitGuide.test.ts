import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFit, type FitMessage } from "./fitGuide";
import { bodyGeometry } from "../src/fit/geometry";
import { fmtCm } from "../src/fit/analyze";

/**
 * 체형별(어린이, 성인 여자, 성인 남자, 통통한 사람, 마른 사람) 신체 치수에
 * 그 체형에 맞는 옷을 입혔을 때 핏 가이드가 정상(ok) 판정을 내는지,
 * 맞지 않는 옷을 입혔을 때는 경고를 내는지 확인.
 * 신체: 둘레(cm) / 옷: 평면 실측(단면, cm)
 */
const body = (height: number, shoulderWidth: number, armLength: number, legLength: number,
              chestCirc: number, waistCirc: number, hipCirc: number, thighCirc: number) =>
  ({ height, shoulderWidth, armLength, legLength, chestCirc, waistCirc, hipCirc, thighCirc });
const cloth = (shoulder: number, chestWidth: number, totalLength: number, sleeveLength: number) => ({ shoulder, chestWidth, totalLength, sleeveLength });
const pants = (pantsLength: number, waist: number, thighWidth: number, rise: number) => ({ pantsLength, waist, thighWidth, rise });

const analyze = (...args: Parameters<typeof analyzeFit>) =>
  Object.fromEntries(analyzeFit(...args).map((m) => [m.category, m])) as Record<string, FitMessage>;

function assertAllWellFitted(result: Record<string, FitMessage>) {
  assert.deepEqual(Object.keys(result).sort(), ["가슴", "기장", "밑위", "바지 기장", "소매", "어깨", "허리", "허벅지"].sort());
  for (const m of Object.values(result)) assert.equal(m.level, "ok", `${m.category}: ${m.message}`);
}

const CHILD = body(128, 30, 42, 56, 64, 56, 66, 38);
const BIG = body(172, 50, 60, 76, 112, 102, 110, 66);

test("어린이에게 아동복", () => {
  assertAllWellFitted(analyze(CHILD, cloth(31, 37, 45, 42), pants(56, 29, 21, 19)));
});

test("성인 여자에게 여성복", () => {
  assertAllWellFitted(analyze(body(162, 38, 54, 74, 84, 66, 92, 52), cloth(39, 46, 58, 54), pants(74, 36, 29, 24)));
});

test("성인 남자에게 남성복", () => {
  assertAllWellFitted(analyze(body(175, 46, 61, 82, 96, 80, 96, 56), cloth(47, 53, 72, 61), pants(82, 41, 31, 27)));
});

test("통통한 사람에게 빅사이즈", () => {
  assertAllWellFitted(analyze(BIG, cloth(52, 61, 76, 60), pants(76, 52, 37, 27)));
});

test("마른 사람에게 슬림핏", () => {
  assertAllWellFitted(analyze(body(178, 40, 62, 86, 84, 68, 86, 46), cloth(41, 47, 68, 62), pants(86, 35, 24, 27)));
});

test("통통한 사람에게 아동복을 입히면 경고", () => {
  const r = analyze(BIG, cloth(31, 37, 45, 42), pants(56, 29, 21, 19));
  assert.equal(r["어깨"].level, "danger");
  assert.equal(r["가슴"].level, "danger");
  assert.match(r["기장"].message, /크롭|허리/);
  assert.equal(r["허리"].level, "danger");
  assert.equal(r["허벅지"].level, "danger");
  assert.match(r["바지 기장"].message, /크롭|반바지/);
});

test("어린이에게 빅사이즈를 입히면 넉넉함 안내", () => {
  const r = analyze(CHILD, cloth(52, 61, 76, 60), pants(76, 52, 37, 30));
  assert.match(r["어깨"].message, /넉넉|드롭/);
  assert.match(r["가슴"].message, /넉넉/);
  assert.match(r["소매"].message, /깁니다/);
  assert.match(r["기장"].message, /허벅지|무릎/);
  assert.equal(r["바지 기장"].level, "warning");
  assert.match(r["허리"].message, /벨트/);
  assert.match(r["밑위"].message, /하이라이즈/);
});

test("옷 어깨가 좁으면 소매는 화장(어깨+소매) 기준으로 짧아짐", () => {
  // 어깨 45인 사람에게 어깨 40·소매 62 상의: 소매만 보면 팔(60)보다 길지만 소매가 2.5cm 안쪽에서 시작함
  const r = analyze(body(175, 45, 60, 80, 95, 80, 95, 55), cloth(40, 48, 60, 62), null);
  assert.equal(r["어깨"].level, "danger");
  assert.equal(r["어깨"].diffLabel, "−5cm");
  assert.equal(r["소매"].diff, -0.5);
});

test("바지 허리는 허리밴드가 걸리는 높이의 몸 둘레와 비교", () => {
  // 밑위가 짧은(로우라이즈) 바지는 허리보다 굵은 골반에 걸리므로 같은 허리 치수라도 더 꽉 낌
  const b = body(175, 45, 60, 80, 95, 80, 95, 55);
  const regular = analyze(b, null, pants(80, 41, 30, 27));
  const low = analyze(b, null, pants(80, 41, 30, 19));
  assert.ok(low["허리"].diff! < regular["허리"].diff!);
  assert.match(low["밑위"].message, /로우라이즈/);
});

test("다리 길이를 키에 비해 너무 길게 넣어도 몸통이 뒤집히지 않음", () => {
  const g = bodyGeometry(body(160, 40, 55, 150, 85, 70, 90, 50));
  assert.ok(g.crotch < g.hipY && g.hipY < g.waistY && g.waistY < g.chestY && g.chestY < g.armpitY && g.armpitY < g.shoulderY);
});

test("수치 표기", () => {
  assert.equal(fmtCm(-5), "−5cm");
  assert.equal(fmtCm(1.04), "+1cm");
  assert.equal(fmtCm(0), "±0cm");
});

test("신체 정보가 없어도 기본값으로 분석", () => {
  assert.equal(analyzeFit(null, cloth(46, 52, 70, 61), null).length, 4);
});

test("숫자가 아닌 값은 형식 오류", () => {
  assert.throws(() => analyzeFit({ height: "abc" }, null, null));
});
