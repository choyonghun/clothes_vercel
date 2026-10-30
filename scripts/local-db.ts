import { mkdirSync } from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { SCHEMA, type Db } from "../server/db";

// 로컬 개발용 파일 DB (PGlite: Postgres와 같은 SQL을 쓰는 내장 DB).
// 기존 Java 버전의 H2처럼 별도 DB 설치 없이 바로 실행할 수 있고, 데이터는 .data/ 폴더에 남아 재시작해도 유지됨
export async function createLocalDb(): Promise<Db> {
  const dir = path.join(process.cwd(), ".data");
  // PGlite는 마지막 폴더만 만들어서 상위 폴더(.data)가 없으면 실패함
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(path.join(dir, "pglite"));
  await pg.exec(SCHEMA);
  return { query: async (sql, params) => (await pg.query<any>(sql, params)).rows };
}
