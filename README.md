# clothes_vercel

옷 사이즈 측정·핏 비교 사이트의 Vercel 배포용 버전입니다.
기존 `clothes` 프로젝트(Spring Boot + React)와 기능은 같고, Java 백엔드를 Vercel 서버 함수(TypeScript)로 옮겼습니다.

| 기존 (clothes) | 이 프로젝트 |
|---|---|
| Spring Boot 컨트롤러 | `api/` 폴더의 Vercel 함수 (API 주소는 그대로) |
| Redis 세션 | 서명된 로그인 쿠키 (30분, 요청할 때마다 연장) |
| H2 메모리 DB | Postgres (배포) / PGlite 파일 DB (로컬 개발, `.data/`) |
| `FitGuideService.java` | `src/fit/analyze.ts` (화면·서버 공용) + `server/fitGuide.ts` (API용 입력 검사) |
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
server/             함수들이 공유하는 코드 (DB, 세션, 입력 검증)
scripts/            로컬 개발 서버 (배포에는 포함되지 않음)
src/                React 화면
  fit/                      치수 정의·신체 형상·핏 판정 (화면과 서버가 같은 코드를 씀)
  figure/                   정면·측면 핏 다이어그램(SVG), 측정 위치 안내 그림
```

## 핏 화면

- **겹쳐 보기 방식**: 옷을 몸 위에 예쁘게 "입히는" 대신, 사람 형태의 실루엣 위에 옷 외곽선을 겹쳐 그립니다.
  옷 선과 몸 선 사이 간격이 곧 여유이고, 옷이 작으면 외곽선이 몸 안쪽으로 들어갑니다.
  (옷 폭 = 몸 폭 × 옷 둘레 ÷ 몸 둘레. 그림과 핏 판정이 같은 공식을 써서 "그림은 헐렁한데 꽉 낀다"는 모순이 생기지 않음)
- **보기 모드 2가지** (그림 아래 버튼으로 전환)
  - **옷핏 확인**: 옷을 불투명하게 칠해 실제로 입었을 때 어떤 실루엣(핏)이 되는지 보여줍니다.
  - **옷공간 확인** (기본): 위의 겹쳐 보기 방식. 옷을 반투명하게 하고 몸 윤곽선을 옷 위에도 그려 몸과 옷 사이 여유·조임을 보여줍니다.
- **정면 + 측면 2뷰**: 측면에서 몸통 두께·엉덩이·밑위가 보입니다.
- 문제가 있는 부위에는 `−5cm` 같은 표시가 붙고, 부위나 핏 가이드 항목에 마우스를 올리면 서로 연결되어 강조됩니다.
- 치수를 바꾸면 300ms 뒤 자동으로 다시 계산합니다 (계산은 브라우저에서 하므로 서버 왕복 없음).

### 측정 기준

| 구분 | 기준 | 항목 |
|---|---|---|
| 신체 | 직선 길이 | 키, 어깨 너비(어깨끝점 사이), 팔 길이(어깨끝점→손목), 다리 길이(가랑이→바닥) |
| 신체 | **둘레** | 가슴, 허리, 엉덩이, 허벅지 |
| 의류 | 평면 실측 | 어깨 너비(솔기~솔기), 총장(옆목점→밑단), 소매 길이(어깨솔기→소매끝), 바지 안쪽 기장, 밑위 |
| 의류 | **단면**(반둘레) | 가슴, 허리, 허벅지 — 내부에서 둘레 = 단면 × 2 로 바꿔 신체 둘레와 비교 |

- 소매는 화장 기준(옷 어깨/2 + 소매 − 몸 어깨/2)으로 팔 길이와 비교합니다. 옷 어깨가 좁으면 소매가 그만큼 안쪽에서 시작하기 때문입니다.
- 바지 허리는 허리 둘레가 아니라 밑위로 계산한 **허리밴드 높이의 몸 둘레**와 비교합니다 (로우라이즈는 골반에 걸림).
- 입력 칸 옆 `?`에 마우스를 올리면 어디를 재는지 그림으로 보여줍니다.

### DB 변경 (자동 적용)

측정 기준이 바뀌면서 열이 추가되었습니다. `server/db.ts`의 `SCHEMA`가 첫 요청 때
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`로 기존 DB에도 자동으로 추가합니다.

- `body_size`: `chest_circ`, `waist_circ`, `hip_circ`, `thigh_circ` 추가 (예전 `body_depth`, `leg_thickness`, `waist_width`, `hip_width`는 더 이상 쓰지 않음)
- `cloth_size`: `chest_width` 추가
- `pants_size`: `thigh_width` 추가 (예전 `thigh_thickness`는 더 이상 쓰지 않음). `waist`는 허리 단면으로 해석

예전 열은 데이터 보존을 위해 지우지 않았습니다. 예전에 저장한 사용자는 새 항목이 기본값으로 채워지고, 화면에 다시 저장하라는 안내가 나옵니다.

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
npm run test:server   # 핏 분석 테스트 (5가지 체형 + 맞지 않는 옷 + 화장·허리밴드 기준)
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
