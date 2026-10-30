import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFit, type FitMessage } from "./fitGuide";

/**
 * 체형별(어린이, 성인 여자, 성인 남자, 뚱뚱한 사람, 마른 사람) 신체 치수에
 * 그 체형에 맞는 옷을 입혔을 때 핏 가이드가 정상(ok) 판정을 내는지,
 * 맞지 않는 옷을 입혔을 때는 경고를 내는지 확인 (Java FitGuideServiceTest와 동일한 시나리오)
 */
const body = (height: number, shoulderWidth: number, armLength: number, legLength: number,
              bodyDepth: number, legThickness: number, waistWidth: number, hipWidth: number) =>
  ({ height, shoulderWidth, armLength, legLength, bodyDepth, legThickness, waistWidth, hipWidth });
const cloth = (shoulder: number, totalLength: number, sleeveLength: number) => ({ shoulder, totalLength, sleeveLength });
const pants = (pantsLength: number, waist: number, thighThickness: number, rise: number) => ({ pantsLength, waist, thighThickness, rise });

const analyze = (...args: Parameters<typeof analyzeFit>) =>
  Object.fromEntries(analyzeFit(...args).map((m) => [m.category, m])) as Record<string, FitMessage>;

function assertAllWellFitted(result: Record<string, FitMessage>) {
  assert.deepEqual(Object.keys(result).sort(), ["기장", "밑위", "바지", "소매", "어깨", "허리", "허벅지"].sort());
  for (const m of Object.values(result)) assert.equal(m.level, "ok", `${m.category}: ${m.message}`);
}

test("어린이에게 아동복", () => {
  assertAllWellFitted(analyze(body(128, 30, 42, 56, 14, 4, 21, 25), cloth(32, 46, 43), pants(57, 23, 5, 9)));
});

test("성인 여자에게 여성복", () => {
  assertAllWellFitted(analyze(body(162, 38, 54, 74, 17, 5.5, 26, 34), cloth(39, 58, 56), pants(75, 28, 6.5, 11)));
});

test("성인 남자에게 남성복", () => {
  assertAllWellFitted(analyze(body(175, 46, 61, 82, 20, 6.5, 32, 36), cloth(48, 72, 62), pants(83, 34, 7.5, 12)));
});

test("뚱뚱한 사람에게 빅사이즈", () => {
  assertAllWellFitted(analyze(body(172, 50, 60, 76, 32, 9, 44, 46), cloth(54, 76, 60), pants(77, 46, 10.5, 13)));
});

test("마른 사람에게 슬림핏", () => {
  assertAllWellFitted(analyze(body(178, 40, 62, 86, 15, 4.5, 25, 31), cloth(42, 72, 63), pants(87, 27, 5.5, 12)));
});

test("뚱뚱한 사람에게 아동복을 입히면 경고", () => {
  const r = analyze(body(172, 50, 60, 76, 32, 9, 44, 46), cloth(32, 46, 43), pants(57, 23, 5, 9));
  assert.equal(r["어깨"].level, "danger");
  assert.equal(r["소매"].level, "warning");
  assert.match(r["기장"].message, /허리 기장/);
  assert.equal(r["허리"].level, "danger");
  assert.equal(r["허벅지"].level, "warning");
  assert.match(r["바지"].message, /반바지/);
});

test("어린이에게 빅사이즈를 입히면 넉넉함 안내", () => {
  const r = analyze(body(128, 30, 42, 56, 14, 4, 21, 25), cloth(54, 76, 60), pants(77, 46, 10.5, 13));
  assert.match(r["어깨"].message, /넉넉/);
  assert.match(r["소매"].message, /깁니다/);
  assert.match(r["기장"].message, /허벅지/);
  assert.equal(r["바지"].level, "warning");
  assert.match(r["허리"].message, /벨트/);
  assert.match(r["밑위"].message, /하이라이즈/);
});

test("신체 정보가 없어도 기본값으로 분석", () => {
  assert.equal(analyzeFit(null, cloth(55, 70, 62), null).length, 3);
});
