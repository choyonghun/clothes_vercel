// 기존 Java 모델(BodySize, ClothSize, PantsSize, User)과 Bean Validation 규칙을 그대로 옮김.
// 검증 실패 시 응답도 Java GlobalExceptionHandler와 같은 { 필드명: 메시지 } 형태

// 측정 기준: 신체 굵기는 둘레, 의류는 평면 실측(단면). 자세한 정의는 src/fit/types.ts
export interface BodySize {
  userId: number | null;
  height: number; shoulderWidth: number; armLength: number; legLength: number;
  chestCirc: number; waistCirc: number; hipCirc: number; thighCirc: number;
}
export interface ClothSize {
  userId: number | null;
  shoulder: number; chestWidth: number; totalLength: number; sleeveLength: number; color: string | null;
}
export interface PantsSize {
  userId: number | null;
  pantsLength: number; waist: number; thighWidth: number; rise: number; color: string | null;
}
export interface User {
  userId?: number;
  loginId: string; password: string; username: string | null;
}

export type FieldErrors = Record<string, string>;

export class InvalidInput extends Error {}

// [최소, 최대] — 어노테이션 값과 같은 문자열로 둬야 메시지가 "250.0"처럼 Java와 동일하게 나옴
type Range = [string, string];
const BODY_RANGES: Record<Exclude<keyof BodySize, "userId">, Range> = {
  height: ["50.0", "250.0"], shoulderWidth: ["20.0", "100.0"], armLength: ["20.0", "120.0"], legLength: ["20.0", "150.0"],
  chestCirc: ["40.0", "200.0"], waistCirc: ["35.0", "200.0"], hipCirc: ["40.0", "200.0"], thighCirc: ["20.0", "120.0"],
};
const CLOTH_RANGES: Record<"shoulder" | "chestWidth" | "totalLength" | "sleeveLength", Range> = {
  shoulder: ["20.0", "100.0"], chestWidth: ["20.0", "120.0"], totalLength: ["20.0", "200.0"], sleeveLength: ["5.0", "120.0"],
};
// 바지 길이는 안쪽 기장이라 반바지면 10cm 안팎도 가능
const PANTS_RANGES: Record<"pantsLength" | "waist" | "thighWidth" | "rise", Range> = {
  pantsLength: ["5.0", "200.0"], waist: ["15.0", "100.0"], thighWidth: ["8.0", "60.0"], rise: ["10.0", "60.0"],
};

/** Java의 primitive double 필드처럼: 값이 없거나 빈 문자열이면 0, 숫자 문자열은 숫자로, 그 외는 형식 오류 */
export function num(v: unknown): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new InvalidInput();
  return n;
}

function userIdOf(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = num(v);
  if (!Number.isInteger(n)) throw new InvalidInput();
  return n;
}

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new InvalidInput();
  return v;
}

function checkRanges(obj: Record<string, any>, ranges: Record<string, Range>, errors: FieldErrors) {
  for (const [field, [min, max]] of Object.entries(ranges)) {
    if (obj[field] < Number(min)) errors[field] = `다음 값 이상이어야 합니다 ${min}`;
    else if (obj[field] > Number(max)) errors[field] = `다음 값 이하여야 합니다 ${max}`;
  }
}

function checkUserId(userId: number | null, errors: FieldErrors) {
  if (userId === null) errors.userId = "널이어서는 안됩니다";
}

// #rrggbb 형식만 허용 — 스크립트 삽입 차단
function checkColor(color: string | null, errors: FieldErrors) {
  if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) errors.color = "color는 #rrggbb 형식이어야 합니다.";
}

function asObject(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new InvalidInput();
  return v as Record<string, unknown>;
}

export function parseBodySize(input: unknown) {
  const o = asObject(input);
  const value: BodySize = {
    userId: userIdOf(o.userId),
    height: num(o.height), shoulderWidth: num(o.shoulderWidth), armLength: num(o.armLength), legLength: num(o.legLength),
    chestCirc: num(o.chestCirc), waistCirc: num(o.waistCirc), hipCirc: num(o.hipCirc), thighCirc: num(o.thighCirc),
  };
  const errors: FieldErrors = {};
  checkUserId(value.userId, errors);
  checkRanges(value, BODY_RANGES, errors);
  return { value, errors };
}

export function parseClothSize(input: unknown) {
  const o = asObject(input);
  const value: ClothSize = {
    userId: userIdOf(o.userId),
    shoulder: num(o.shoulder), chestWidth: num(o.chestWidth), totalLength: num(o.totalLength), sleeveLength: num(o.sleeveLength), color: str(o.color),
  };
  const errors: FieldErrors = {};
  checkUserId(value.userId, errors);
  checkRanges(value, CLOTH_RANGES, errors);
  checkColor(value.color, errors);
  return { value, errors };
}

export function parsePantsSize(input: unknown) {
  const o = asObject(input);
  const value: PantsSize = {
    userId: userIdOf(o.userId),
    pantsLength: num(o.pantsLength), waist: num(o.waist), thighWidth: num(o.thighWidth), rise: num(o.rise), color: str(o.color),
  };
  const errors: FieldErrors = {};
  checkUserId(value.userId, errors);
  checkRanges(value, PANTS_RANGES, errors);
  checkColor(value.color, errors);
  return { value, errors };
}

/** 관리자 계정 아이디 (이 계정만 모든 댓글을 삭제할 수 있음). 회원가입으로는 만들 수 없고 scripts/create-admin.ts로만 만듦 */
export const ADMIN_LOGIN_ID = "admin";

/** 회원가입에 쓸 수 없는 아이디 (Admin, ADMIN처럼 대소문자만 바꾼 것도 관리자로 오해할 수 있어 함께 막음) */
export const isReservedLoginId = (loginId: string) => loginId.trim().toLowerCase() === ADMIN_LOGIN_ID;

export function parseUser(input: unknown) {
  const o = asObject(input);
  const value: User = { loginId: str(o.loginId) ?? "", password: str(o.password) ?? "", username: str(o.username) };
  const errors: FieldErrors = {};
  // 영문·숫자·언더스코어만 허용 — SQL 인젝션·XSS 원천 차단
  if (!value.loginId.trim()) errors.loginId = "아이디를 입력해주세요.";
  else if (value.loginId.length < 3 || value.loginId.length > 50) errors.loginId = "아이디는 3~50자 사이여야 합니다.";
  else if (!/^[a-zA-Z0-9_]+$/.test(value.loginId)) errors.loginId = "아이디는 영문, 숫자, 언더스코어만 사용 가능합니다.";
  if (!value.password.trim()) errors.password = "비밀번호를 입력해주세요.";
  else if (value.password.length < 4 || value.password.length > 100) errors.password = "비밀번호는 4~100자 사이여야 합니다.";
  if (value.username !== null && value.username.length > 50) errors.username = "이름은 50자 이하여야 합니다.";
  return { value, errors };
}

// ── 개발자한테 바라는 목록(댓글) ──────────────────────────
export const COMMENT_MAX = 1000;
export interface CommentInput { content: string; parentId: number | null }

export function parseComment(input: unknown) {
  const o = asObject(input);
  const value: CommentInput = { content: (str(o.content) ?? "").trim(), parentId: userIdOf(o.parentId) };
  const errors: FieldErrors = {};
  if (!value.content) errors.content = "내용을 입력해주세요.";
  else if (value.content.length > COMMENT_MAX) errors.content = `댓글은 ${COMMENT_MAX}자 이하여야 합니다.`;
  return { value, errors };
}

// 데이터가 아직 없을 때 Java의 new BodySize() 등과 같은 빈 객체 (프론트는 height 등이 0이면 기본값 유지)
export const emptyBody = (): BodySize => ({ userId: null, height: 0, shoulderWidth: 0, armLength: 0, legLength: 0, chestCirc: 0, waistCirc: 0, hipCirc: 0, thighCirc: 0 });
export const emptyCloth = (): ClothSize => ({ userId: null, shoulder: 0, chestWidth: 0, totalLength: 0, sleeveLength: 0, color: null });
export const emptyPants = (): PantsSize => ({ userId: null, pantsLength: 0, waist: 0, thighWidth: 0, rise: 0, color: null });
