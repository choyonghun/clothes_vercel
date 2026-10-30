import { getDb } from "./db";
import type { BodySize, ClothSize, PantsSize, User } from "./models";

// 기존 Java BodyStatsRepository / LoginRepository와 같은 쿼리 (H2 MERGE 대신 Postgres의 ON CONFLICT 사용).
// BIGINT는 드라이버에 따라 문자열/BigInt로 오므로 프론트가 기대하는 숫자로 변환
const id = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// ── 사용자 ─────────────────────────────────────────────
export async function findUserByLoginId(loginId: string): Promise<User | null> {
  const db = await getDb();
  const [r] = await db.query("SELECT * FROM users WHERE login_id = $1", [loginId]);
  return r ? { userId: id(r.user_id)!, loginId: r.login_id, password: r.password, username: r.username } : null;
}

export async function saveUser(user: User) {
  const db = await getDb();
  await db.query("INSERT INTO users (login_id, password, username) VALUES ($1, $2, $3)", [user.loginId, user.password, user.username]);
}

// ── 신체 / 옷 / 바지 치수 ───────────────────────────────
export async function saveBodySize(s: BodySize) {
  const db = await getDb();
  await db.query(
    `INSERT INTO body_size (user_id, height, shoulder_width, arm_length, leg_length, body_depth, leg_thickness, waist_width, hip_width)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id) DO UPDATE SET height = EXCLUDED.height, shoulder_width = EXCLUDED.shoulder_width,
       arm_length = EXCLUDED.arm_length, leg_length = EXCLUDED.leg_length, body_depth = EXCLUDED.body_depth,
       leg_thickness = EXCLUDED.leg_thickness, waist_width = EXCLUDED.waist_width, hip_width = EXCLUDED.hip_width`,
    [s.userId, s.height, s.shoulderWidth, s.armLength, s.legLength, s.bodyDepth, s.legThickness, s.waistWidth, s.hipWidth]);
}

export async function saveClothSize(s: ClothSize) {
  const db = await getDb();
  await db.query(
    `INSERT INTO cloth_size (user_id, shoulder, total_length, sleeve_length, color) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET shoulder = EXCLUDED.shoulder, total_length = EXCLUDED.total_length,
       sleeve_length = EXCLUDED.sleeve_length, color = EXCLUDED.color`,
    [s.userId, s.shoulder, s.totalLength, s.sleeveLength, s.color]);
}

export async function savePantsSize(s: PantsSize) {
  const db = await getDb();
  await db.query(
    `INSERT INTO pants_size (user_id, pants_length, waist, thigh_thickness, rise, color) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET pants_length = EXCLUDED.pants_length, waist = EXCLUDED.waist,
       thigh_thickness = EXCLUDED.thigh_thickness, rise = EXCLUDED.rise, color = EXCLUDED.color`,
    [s.userId, s.pantsLength, s.waist, s.thighThickness, s.rise, s.color]);
}

export async function findBodyById(userId: number): Promise<BodySize | null> {
  const db = await getDb();
  const [r] = await db.query("SELECT * FROM body_size WHERE user_id = $1", [userId]);
  return r ? {
    userId: id(r.user_id), height: r.height, shoulderWidth: r.shoulder_width, armLength: r.arm_length, legLength: r.leg_length,
    bodyDepth: r.body_depth, legThickness: r.leg_thickness, waistWidth: r.waist_width, hipWidth: r.hip_width,
  } : null;
}

export async function findClothById(userId: number): Promise<ClothSize | null> {
  const db = await getDb();
  const [r] = await db.query("SELECT * FROM cloth_size WHERE user_id = $1", [userId]);
  return r ? { userId: id(r.user_id), shoulder: r.shoulder, totalLength: r.total_length, sleeveLength: r.sleeve_length, color: r.color } : null;
}

export async function findPantsById(userId: number): Promise<PantsSize | null> {
  const db = await getDb();
  const [r] = await db.query("SELECT * FROM pants_size WHERE user_id = $1", [userId]);
  return r ? {
    userId: id(r.user_id), pantsLength: r.pants_length, waist: r.waist, thighThickness: r.thigh_thickness, rise: r.rise, color: r.color,
  } : null;
}
