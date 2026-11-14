
The released site is the static GitHub Pages build (`npm run pages:build`). The vinext server build (`npm run build`) is kept for rendered-page tests and loca
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

- Seven ships and 77 Install nodes with three named Loadout slots per ship. Each slot keeps its own levels, recommendation mode, exclusions, and saved purchase order; the ship's total Install points, rank, crew, and evolution stay shared.
- Pre-Ouroboros scope ends at Zeus and Generator MK8. Ouroboros ship, traversal, gems, and MK9+ are reserved for a separate post-Ouroboros update.
- Five recommendation modes, a purchase-order plan, and a final-effects view. Double-click an Install node to record one purchase, or apply every step of a fresh generated/saved recommendation to the current web levels in one action.
- Ship Rank/Crew and other shared profile inputs remain local to the browser.
- Purchases and bulk application change browser-local records only, not the game. The recommendation and effect calculations are estimates; compare important purchases with the current game.
- Existing single-allocation saves are migrated into the Loadout selected when that save was made; the other two allocations start at zero.
- The selected Loadout can undo the last recorded one-level purchase (including a bulk recommendation step) or reset its levels and saved order after confirmation. Direct level edits clear that Loadout's purchase history.
- Settings can export and import all known app-local data as a JSON backup. Import backs up current data first, asks for confirmation, and replaces only this app's keys; no file is uploaded to a server.

## Known Limits

- Ship Install does not read Gear, Badge, research, or evolution multipliers automatically; enter a modifier when you need them. Zero-progress correction rules that are not verified use the entered value as is.
- Mod maximum levels follow the static sheet. Dynamic maximum-level extensions such as Inscryption are not modeled yet.
- Install and Mod effects come from native game data, but no purchase was measured in the live game (`runtimeVerified: false`).
- Hephaestus 8 uses the native calculation coefficient (1%); its in-game tooltip shows 0.01%.
- Two native-data cross-check tests need a local audit manifest that is not published, so they are skipped in public CI.

## Useful Commands

Mod Tree 아이콘은 `public/assets/mod-tree/`에서 한 번만 관리한다. 코드·레이어 매핑은 `lib/cifi/mod-tree/icons.json`, 표시 크기와 라벨 간격은 `lib/cifi/mod-tree/presentation.ts`에 있다.

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build, then discover and run every `tests/**/*.test.mjs` suite (rendered page, Mod Tree, optimizer, and assets)
- `npm run test:all`: run all suites against the existing build; rebuild first after source changes
- `npm run test:mod-tree`: run the Mod Tree suite without a production build
- `npm run typecheck`: check TypeScript on a clean checkout, without generated runtime declarations
- `npm run lint`: run ESLint (CI runs it together with typecheck, tests, and the Pages build)
- `npm run types:runtime`: optionally generate full Cloudflare runtime declarations locally after a server build; the file is ignored by Git
- `npm run pages:dev`: start the GitHub Pages version locally
- `npm run pages:build`: create the static GitHub Pages release output

## Branch and Release Workflow

- `develop`: default branch for routine development and local review. Start every routine change from the latest `develop`.
- `feature/*`, `fix/*`, `refactor/*`: short-lived branches merged into `develop` after local review with `npm run pages:dev`.
- `main`: approved release source only. After the user explicitly approves a release (`배포 승인`), open a `develop -> main` pull request and merge it only after `Validate source and static build` succeeds.
- `hotfix/*`: emergency production repairs branch from `main`, merge into `main`, and then merge back into `develop` so the two never diverge.
- Pull requests and pushes to `develop` and `main` run typecheck, lint, tests, and the static build. Only a push to `main` deploys `dist-pages/` to GitHub Pages through GitHub Actions.
- `gh-pages` is kept as a rollback reference to the last manual deployment. Do not publish to it.

After a release, confirm the Actions run, the Pages environment, the public URL response, and the current asset references before treating the deployment as done.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
