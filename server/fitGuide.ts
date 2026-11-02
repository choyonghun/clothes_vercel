import { num } from "./models";
import { analyzeOutfit } from "../src/fit/analyze";
import type { FitItem } from "../src/fit/types";

// 핏 계산 본체는 화면과 같은 코드(src/fit/analyze.ts)를 사용함.
// 서버와 화면이 각자 공식을 갖고 있으면 "그림은 헐렁한데 판정은 꽉 낀다" 같은 불일치가 다시 생기기 때문.
// 여기서는 요청 값 형식 검사(숫자가 아니면 400)만 담당

export type FitMessage = FitItem;

type Input = Record<string, unknown> | null | undefined;

/** 객체의 각 값을 숫자로 바꿈 (숫자가 아닌 값이 있으면 InvalidInput → 400) */
function numbers(o: Input): Record<string, number> | null {
  if (!o || typeof o !== "object") return null;
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== "color" && k !== "userId").map(([k, v]) => [k, num(v)]));
}

export function analyzeFit(body: Input, cloth: Input, pants: Input, skirt?: Input, dress?: Input): FitMessage[] {
  return analyzeOutfit(numbers(body), {
    top: numbers(cloth) as any,
    pants: numbers(pants) as any,
    skirt: numbers(skirt) as any,
    dress: numbers(dress) as any,
  });
}
