# CIFI Ultimate Optimizer v0.4.2

A local-first web prototype for CIFI player progression input and Weight presets.

입력값과 프리셋은 각 브라우저에만 저장되며 이 저장소에는 포함하지 않는다.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Local Preview (Windows)

- `CIFI 서버 실행기.bat`: 이 PC 전용 서버를 새 창에서 시작하고 브라우저를 연다. 서버 창에서 `Ctrl+C`로 종료한다.
- `start-local-server.bat`: 현재 창에서 이 PC 전용 서버를 실행한다.
- `start-lan-test-server.bat`: 같은 Wi-Fi/LAN의 다른 기기에서 접속할 테스트 서버를 실행한다. 공개 인터넷용 서버가 아니며, 공유기나 방화벽 설정을 자동 변경하지 않는다. 신뢰하는 사설망에서만 사용한다.
- 로컬 주소: `http://127.0.0.1:5173/cifi-ultimate-optimizer/`
- 실행 전에 `npm install`이 필요하다. 5173 포트 충돌 시 기존 프로세스는 종료하지 않는다.
- `localhost`와 `127.0.0.1`은 브라우저 저장 공간이 서로 다르므로, 저장한 진행도를 계속 사용하려면 같은 주소를 사용한다. 기본 실행기는 기존처럼 `localhost`를 연다.
- 정적/서버 빌드는 모두 `public/`의 동일한 이미지 정본을 사용한다. 이미지 교체는 이 폴더에서 수행한다.

## Diamond / Token Upgrade Optimizer

- `업그레이드 옵티마이저 → 다이아몬드/토큰`에서 보유 재화와 현재 업그레이드 레벨을 입력한다.
- 가중치 입력값은 효율 공식에, 플레이어 진행도와 함선 승무원 입력값은 해금 판정에 연결된다.
- 다이아몬드 46개와 토큰 23개의 비용·최대 레벨·해금·효율 규칙은 CIFI Optimizer v1.10.30을 기준으로 정규화했다.
- 구매 계획은 매 구매 후 효율을 다시 계산하고, 현재 예산 안에서 가장 효율적인 항목을 순서대로 선택한다.
- 옵티마이저 입력과 계산 결과 반영 상태는 브라우저 로컬 저장소에만 저장된다.

```bash
npm run test:optimizer
```

## Mod Tree Recommendations

- `Mod Tree 추천`에서 현재 보유 MP와 노드별 현재 레벨을 입력한다. 저장한 가중치·플레이어/함선 진행도가 추천 계산에 연결된다.
- Pre-Ouroboros 274개 노드를 대상으로 한다. 원본 지도·아이콘·연결은 유지하고 상위 추천 노드를 강조한다. 추천 목록을 누르면 해당 위치로 이동한다.
- 비용 중요도(0–100%), 노드 제외, 다음 비용/효과, 10–200단계 계획, 웹 기록 반영과 마지막 반영 되돌리기를 지원한다.
- `레벨 일괄 입력 / 백업`에서 `A01=5` 형식으로 여러 레벨을 입력하거나 이 탭의 JSON 백업을 내보내고 불러온다. 입력은 브라우저에만 저장하며 실제 게임은 조작하지 않는다.
- MP는 `1e4000` 같은 과학 표기도 지원한다(0 이상, `1e10000` 미만). 무한 노드는 시트 로컬 상한인 99,999레벨까지 계산한다.

```bash
node --experimental-strip-types tests/mod-tree-recommendations.test.mjs
```

## Ship Install

- Seven ships and 77 Install nodes with three saved Loadout slots per ship.
- Five recommendation modes, a purchase-order plan, and a final-effects view.
- Ship Rank/Crew and other shared profile inputs remain local to the browser.
- The recommendation and effect calculations are estimates; compare important purchases with the current game before applying them.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

Mod Tree 아이콘은 `public/assets/mod-tree/`에서 한 번만 관리한다. 코드·레이어 매핑은 `lib/cifi/mod-tree/icons.json`, 표시 크기와 라벨 간격은 `lib/cifi/mod-tree/presentation.ts`에 있다.

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build, then discover and run every `tests/**/*.test.mjs` suite (rendered page, Mod Tree, optimizer, and assets)
- `npm run test:all`: run all suites against the existing build; rebuild first after source changes
- `npm run test:mod-tree`: run the Mod Tree suite without a production build
- `npm run typecheck`: check TypeScript, including ES2020 decimal arithmetic and Worker runtime types
- `npm run types:runtime`: regenerate the checked-in Cloudflare runtime declarations after a server build or runtime compatibility change
- `npm run pages:dev`: start the GitHub Pages version locally
- `npm run pages:build`: create the static GitHub Pages release output
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Branch and Release Workflow

- `develop`: default branch for routine development and local review.
- `feature/*`, `fix/*`, `refactor/*`: short-lived branches merged into `develop`.
- `main`: approved production source only. Promote `develop` through a pull request after release approval.
- A pull request into `main` runs the complete validation build without deploying.
- A successful push to `main` deploys `dist-pages/` to GitHub Pages through GitHub Actions.
- `gh-pages` is retained temporarily as a rollback reference while the Actions deployment is being verified.

For routine work, review locally with `npm run pages:dev`. Do not promote or deploy until the user explicitly approves the release.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
