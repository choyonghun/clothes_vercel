// 관리자(admin) 계정 만들기 — 회원가입 화면에서는 admin 아이디를 막아 두었으므로 이 스크립트로만 만듦.
//
//   로컬 DB(.data/):     npm run create-admin -- <비밀번호>
//   배포 DB(Vercel 등):   DATABASE_URL=postgres://... npm run create-admin -- <비밀번호>
//                         (PowerShell: $env:DATABASE_URL="postgres://..."; npm run create-admin -- <비밀번호>)
//   비밀번호 다시 설정:   npm run create-admin -- <새 비밀번호> --reset
//
// 비밀번호를 명령어에 남기기 싫으면 ADMIN_PASSWORD 환경변수로 넘겨도 됨.
// Supabase를 쓰면 DATABASE_CA_CERT도 함께 지정해야 함 (README의 Supabase 항목 참고)
import bcrypt from "bcryptjs";
import { getDb, setLocalDb } from "../server/db";
import { ADMIN_LOGIN_ID } from "../server/models";
import { findUserByLoginId, saveUser } from "../server/repository";
import { createLocalDb } from "./local-db";

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const password = args.find((a) => !a.startsWith("--")) ?? process.env.ADMIN_PASSWORD ?? "";
  if (password.length < 8 || password.length > 100) {
    console.error("관리자 비밀번호는 8~100자로 지정해주세요.  예) npm run create-admin -- MyStrongPass123");
    process.exit(1);
  }

  const remote = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (!remote) setLocalDb(createLocalDb);
  console.log(`DB: ${remote ? "DATABASE_URL" : ".data/pglite 로컬 파일"}`);

  const hash = await bcrypt.hash(password, 10);
  const existing = await findUserByLoginId(ADMIN_LOGIN_ID);
  if (existing && !reset) {
    console.log(`'${ADMIN_LOGIN_ID}' 계정이 이미 있습니다. 비밀번호를 바꾸려면 --reset 을 붙여 다시 실행하세요.`);
    return;
  }
  if (existing) {
    const db = await getDb();
    await db.query("UPDATE users SET password = $1 WHERE login_id = $2", [hash, ADMIN_LOGIN_ID]);
    console.log(`'${ADMIN_LOGIN_ID}' 계정의 비밀번호를 다시 설정했습니다.`);
  } else {
    await saveUser({ loginId: ADMIN_LOGIN_ID, password: hash, username: "관리자" });
    console.log(`'${ADMIN_LOGIN_ID}' 관리자 계정을 만들었습니다.`);
  }
}

main()
  .then(() => process.exit(0)) // Postgres 연결 풀이 남아 있으면 프로세스가 끝나지 않으므로 직접 종료
  .catch((e) => { console.error(e); process.exit(1); });
