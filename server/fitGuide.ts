import { num } from "./models";

export interface FitMessage {
  category: string;  // 어깨, 소매, 기장, 바지, 허리, 허벅지, 밑위
  message: string;
  level: "ok" | "info" | "warning" | "danger";
}

type Input = Record<string, unknown> | null | undefined;

export function analyzeFit(body: Input, cloth: Input, pants: Input): FitMessage[] {
  const messages: FitMessage[] = [];
  const add = (category: string, message: string, level: FitMessage["level"]) => messages.push({ category, message, level });
  const b = body || {};

  const bodyHeight    = num(b.height)        > 0 ? num(b.height)        : 175;
  const bodyShoulderW = num(b.shoulderWidth) > 0 ? num(b.shoulderWidth) : 45;
  const bodyArmLength = num(b.armLength)     > 0 ? num(b.armLength)     : 60;
  const bodyLegLength = num(b.legLength)     > 0 ? num(b.legLength)     : 85;

  // 3D 마네킹(FittingPage.tsx getBodyShape)과 같은 기준으로 몸통 위치를 계산해야
  // 화면에 보이는 기장과 핏 가이드 문구가 일치함
  // 머리는 키에 정비례하지 않으므로(어린이는 머리가 큼) 제곱근 비율로 조절
  const headScale = Math.min(1.05, Math.max(0.7, Math.sqrt(bodyHeight / 175)));
  const shoulderY = bodyHeight - 25 * headScale - 6.5 * bodyHeight / 175;
  // 다리가 몸통을 침범할 만큼 길게 입력되면 몸통 높이가 뒤집히므로 3D와 동일하게 제한
  const legY      = Math.min(bodyLegLength, shoulderY - 22);
  const torsoH    = shoulderY - legY;
  const waistY    = legY + torsoH * 0.33;
  const hipY      = legY + torsoH * 0.12;
  // 키에 따른 비율 (어린이 옷의 밑위 등 절대 cm 기준을 체격에 맞춰 조정)
  const scale     = bodyHeight / 175;

  // ── 상의 핏 ──────────────────────────────────────────
  if (cloth) {
    // 1. 어깨
    const shoulderDiff = num(cloth.shoulder) - bodyShoulderW;
    if (shoulderDiff < -3)       add("어깨", "어깨가 매우 꽉 낄 수 있습니다", "danger");
    else if (shoulderDiff < 0)   add("어깨", "어깨가 약간 꽉 낄 수 있습니다", "warning");
    else if (shoulderDiff <= 5)  add("어깨", "어깨 핏이 적당합니다", "ok");
    else                         add("어깨", "어깨가 넉넉합니다 (루즈핏)", "info");

    // 2. 소매 길이
    const sleeveDiff = num(cloth.sleeveLength) - bodyArmLength;
    if (sleeveDiff < -5)         add("소매", "소매가 많이 짧습니다", "warning");
    else if (sleeveDiff < -2)    add("소매", "소매가 약간 짧습니다", "info");
    else if (sleeveDiff <= 3)    add("소매", "소매 길이가 적당합니다", "ok");
    else                         add("소매", "소매가 깁니다", "info");

    // 3. 옷 총장: 어깨선에서 총장만큼 내려온 밑단 위치가 몸의 어디에 닿는지로 판단
    const hemY = shoulderY - num(cloth.totalLength);
    if (hemY > waistY)                            add("기장", "크롭 기장입니다 (허리 위)", "info");
    else if (hemY > hipY)                         add("기장", "허리 기장입니다", "ok");
    else if (hemY > legY - bodyLegLength * 0.2)   add("기장", "엉덩이를 덮는 기장입니다", "ok");
    else                                          add("기장", "허벅지를 덮는 기장입니다", "info");
  }

  // ── 하의 핏 ──────────────────────────────────────────
  if (pants) {
    // 4. 바지 길이
    // 바지 길이는 순수 다리(인심) 길이이고, 밑위/허리밴드는 크로치 위로 별도로 얹히는 구간이라
    // 다리를 덮는 길이에서 뺄 필요가 없음 (3D 모델과 동일한 기준)
    const pantsDiff = num(pants.pantsLength) - bodyLegLength;
    if (pantsDiff < -10)         add("바지", "반바지 기장입니다", "info");
    else if (pantsDiff < -3)     add("바지", "바지가 짧습니다 (발목 위)", "info");
    else if (pantsDiff <= 5)     add("바지", "바지 길이가 적당합니다", "ok");
    else                         add("바지", "바지가 길어 밑단이 끌릴 수 있습니다", "warning");

    // 5. 허리 (신체 허리 너비와 같은 "전체 폭" 단위)
    if (num(pants.waist) > 0 && num(b.waistWidth) > 0) {
      const waistDiff = num(pants.waist) - num(b.waistWidth);
      if (waistDiff < -2)        add("허리", "허리가 작아 잠기지 않을 수 있습니다", "danger");
      else if (waistDiff < 0)    add("허리", "허리가 약간 꽉 낄 수 있습니다", "warning");
      else if (waistDiff <= 4)   add("허리", "허리 핏이 적당합니다", "ok");
      else                       add("허리", "허리가 커서 벨트가 필요합니다", "info");
    }

    // 6. 허벅지 (신체 허벅지 두께와 같은 단위)
    if (num(pants.thighThickness) > 0 && num(b.legThickness) > 0) {
      const thighDiff = num(pants.thighThickness) - num(b.legThickness);
      if (thighDiff < 0)         add("허벅지", "허벅지가 꽉 낄 수 있습니다", "warning");
      else if (thighDiff <= 1.5) add("허벅지", "허벅지가 슬림하게 맞습니다", "ok");
      else                       add("허벅지", "허벅지가 넉넉합니다 (와이드핏)", "info");
    }

    // 7. 밑위 길이 (성인 기준 8~14cm를 키에 비례해 조정)
    const rise = num(pants.rise);
    if (rise > 0) {
      if (rise < 8 * scale)        add("밑위", "로우라이즈 핏입니다", "info");
      else if (rise <= 14 * scale) add("밑위", "밑위 길이가 적당합니다", "ok");
      else                         add("밑위", "하이라이즈 핏입니다", "info");
    }
  }

  return messages;
}
