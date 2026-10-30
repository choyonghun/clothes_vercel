# clothes_vercel

옷 사이즈 측정·3D 피팅 사이트의 Vercel 배포용 버전입니다.
기존 `clothes` 프로젝트(Spring Boot + React)와 기능은 같고, Java 백엔드를 Vercel 서버 함수(TypeScript)로 옮겼습니다.

| 기존 (clothes) | 이 프로젝트 |
|---|---|
| Spring Boot 컨트롤러 | `api/` 폴더의 Vercel 함수 (API 주소는 그대로) |
| Redis 세션 | 서명된 로그인 쿠키 (30분, 요청할 때마다 연장) |
| H2 메모리 DB | Postgres (배포) / PGlite 파일 DB (로컬 개발, `.data/`) |
| `FitGuideService.java` | `server/fitGuide.ts` |
| `FitGuideServiceTest.java` | `server/fitGuide.test.ts` |

## 폴더 구조

```
api/                Vercel 함수 (파일 경로 = API 주소)
  login/index.ts            POST /api/login
  login/check.ts            GET  /api/login/check
  login/logout.ts           POST /api/login/logout
  login/register.ts         POST /api/login/register
  bodycheck/body.ts         POST /api/bodycheck/body
  bodycheck/cloth.ts        POST /api/bodycheck/cloth
  bodycheck/pants.ts        POST /api/bodycheck/pants
  bodycheck/fitguide.ts     POST /api/bodycheck/fitguide
  bodycheck/allstats/[userId].ts  GET /api/bodycheck/allstats/{userId}
server/             함수들이 공유하는 코드 (DB, 세션, 입력 검증, 핏 분석)
scripts/            로컬 개발 서버 (배포에는 포함되지 않음)
src/                React 화면 (기존과 동일)
```

## 로컬 실행

```bash
npm install
npm run dev
```

- http://localhost:3000 접속 → 회원가입 후 로그인
- API 개발 서버(3001)와 React 개발 서버(3000)가 함께 뜹니다.
- DB 설치는 필요 없습니다. 데이터는 `.data/` 폴더에 저장되어 재시작해도 남습니다. (초기화하려면 `.data/` 삭제)
- 로컬에서 실제 Postgres를 쓰려면 `DATABASE_URL`을 지정해서 실행합니다.
  - PowerShell: `$env:DATABASE_URL="postgres://..."; npm run dev`
  - bash: `DATABASE_URL=postgres://... npm run dev`

## 테스트

```bash
npm run test:server   # 핏 분석 테스트 (5가지 체형 + 맞지 않는 옷)
npm run typecheck     # React + 서버 코드 타입 검사
```

## Vercel 배포

1. **GitHub에 올리기**: 이 폴더를 GitHub 저장소로 push 합니다.
2. **Vercel에서 프로젝트 가져오기**: vercel.com → Add New → Project → 저장소 선택.
   프레임워크는 Create React App으로 자동 인식되며, 설정을 바꿀 필요는 없습니다.
3. **DB 연결** (둘 중 하나)
   - Vercel 프로젝트 → Storage → Postgres(Neon) 생성 후 프로젝트에 연결 → `DATABASE_URL`이 자동으로 등록됩니다.
   - 또는 Neon, Supabase 등에서 Postgres를 만들고 연결 문자열을 환경변수 `DATABASE_URL`로 직접 등록합니다.
4. **환경변수 `SESSION_SECRET` 등록**: 로그인 쿠키 서명용 비밀 값입니다. 아래 명령으로 만든 값을 넣으세요.
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. **Deploy**. 테이블은 첫 요청 때 자동으로 만들어집니다. (`server/db.ts`의 `SCHEMA`)

### Supabase를 DB로 쓰는 경우

1. supabase.com에서 프로젝트 생성 (Region은 Seoul `ap-northeast-2` 권장, DB 비밀번호는 따로 적어두기)
2. 상단 **Connect** 버튼 → **Transaction pooler** 연결 문자열(포트 `6543`) 복사 후 `[YOUR-PASSWORD]`를 실제 비밀번호로 바꿈
   → Vercel 환경변수 `DATABASE_URL`로 등록
   (서버리스 함수는 동시에 여러 개가 떠서 연결 수가 많아지므로, 직접 연결(5432) 대신 pooler를 씁니다)
3. Supabase → Project Settings → Database → **SSL Configuration → Download certificate**로 받은 파일 내용을 통째로
   Vercel 환경변수 `DATABASE_CA_CERT`로 등록 (Supabase 인증서는 자체 CA로 서명되어 있어 이 값으로 검증합니다)
4. `SESSION_SECRET` 등록 후 Deploy

> Vercel 마켓플레이스의 Supabase 연동을 쓰면 `POSTGRES_URL`이 자동 등록되므로 2번은 생략해도 됩니다. 3번은 필요합니다.

환경변수를 나중에 추가·변경했다면 Redeploy 해야 반영됩니다.

> GitHub 없이 올리려면: `npx vercel` (미리보기 배포) → `npx vercel --prod` (운영 배포).
> 이 경우에도 3, 4번 환경변수는 Vercel 대시보드에서 등록해야 합니다.

## 기존 Java 버전과 달라진 점

- **본인 데이터만 접근 가능**: 기존에는 요청에 담긴 `userId`를 그대로 믿어서 다른 사람의 치수를 조회·수정할 수 있었습니다.
  이제 로그인한 본인이 아니면 403을 반환합니다. (치수 저장·조회는 로그인 필수, 로그인 전엔 401)
- **로그아웃**: 쿠키 방식이라 로그아웃은 브라우저의 로그인 쿠키를 지우는 방식입니다.
- `/api/redis/*` 테스트용 API는 Redis를 쓰지 않으므로 옮기지 않았습니다.
