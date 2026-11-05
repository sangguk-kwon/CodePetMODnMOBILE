# 진행 상태와 다음 작업

기준일: **2026-11-05 (Asia/Seoul)**

## 현재 상태

**모델·추론 연속성의 UI와 실행부를 구현했다. Claude가 변경된 실행부의 실제 공급자 재개와 Windows 빌드를 검증했고, 리뷰에서 요청한 복구 컨텍스트 예산·테스트 환경 수정을 반영했다. 최종 재리뷰와 앱 화면 직접 조작 검증이 남아 있다.**

| 항목 | 상태 | 근거/메모 |
|---|---|---|
| 공개 Fork 확보 | 확인 | `sangguk-kwon/CodePetMODnMOBILE`, 원본 `nokryong/CodePet` |
| 원본 기준선 | 소스 기준 확인 | v1.2.2, `ca3d5c1ce2d7f96e904deb68ac88c660b8251371` |
| 개발 지침·구조·로드맵 | 작성 | 이 커밋의 AGENTS와 docs 문서 |
| 기존 테스트/앱 빌드 | 변경 후 빌드 확인, 리뷰 수정 검증 중 | Claude 보고: 변경된 코드의 Windows 빌드·패키지 준비 검사 성공. 아래 실행 환경별 자동 검사 결과 참고 |
| Claude/Codex 실제 연동 | 변경된 실행부에서 제한된 조합 확인 | Claude 보고: createChatFeature + 실제 CLI로 모델 변경 후 동일 세션/스레드와 코드워드 보존. 추론 실제 적용은 미검증 |
| Chrome/Codex 브라우저 | P1 예정 | 기존 연결 재사용 선호만 확정 |
| PC 새 기능 | 모델·추론 연속성 구현, 리뷰 대기 | scope 마이그레이션, 턴 설정 고정, Claude 실제 모델 기록, 경고 처리. 실제 앱 흐름 재검증 필요 |
| Android 프로젝트/APK | 미구현 | Kotlin/Compose 방향만 문서화 |
| 원격 서버·페어링·알림 | 미구현 | 서비스 배포/포트 공개/기기 연결 없음 |
| 개조판 업데이트/릴리스 | 포크 채널 구현, 게시 미실행 | 업데이트 조회·검증·AppImage 대상 통일. 포크 정식 릴리스 게시와 실업데이트 검증 필요 |

기존 계획 커밋은 문서와 README 안내만 바꿨다. 현재 작업 브랜치의 UI 초안은
별도 미커밋 변경이며, 앱 ID·사용자 계정·전역 CLI 설정은 변경하지 않았다.

## 2026-11-05 / 포크 첫 릴리스 / chore/release-1.2.3

바뀐 동작: 버전을 1.2.3으로 올리고 이 PC에서 빌드한 Windows 포터블을 포크 릴리스로 게시한다.
Actions가 등록되지 않아 CI·릴리스 워크플로는 사용하지 않았다. 게시 결과는 릴리스 페이지가 기준이다.

## 2026-11-05 / 일상 사용 개선 / fix/taskbar-weather-overlap

바뀐 동작: 왼쪽 정렬 작업표시줄에서 사용량 위젯이 Windows 위젯(날씨) 버튼 왼쪽에 놓인다.
XAML 버튼은 HWND가 없어 UI Automation의 `WidgetsButton`으로 위치를 읽는다. 조회는 UI 스레드 밖에서
2초마다 실행한다. 위젯이 작업표시줄 트리 안에 있어 UI 스레드에서 조회하면 자기 자신을 기다릴 수 있다.

검증: Windows 11 왼쪽 정렬·100% 배율 실기기에서 날씨 버튼 x=2150, 위젯 x=2000~2146으로 겹침 없음.
`scripts/test-taskbar-renderer.ps1` PASS. 가운데 정렬·고배율·다중 모니터는 미검증.

병합 기록: PR #1(모델·추론 변경 후 세션 유지), PR #2(Fork 전용 작업 규칙)가 `develop`에 병합됐다.
원본의 nokryong/CodePet#28은 의도치 않게 열렸다가 병합 없이 닫혔고, 생성 경위는 확정하지 못했다.
## 2026-11-05 / 포크 업데이트 채널 / feat/fork-update-channel

- `src/release-channel.js`를 단일 저장소 정의로 사용해 업데이트 조회 API, 다운로드 검증 prefix,
  AppImage zsync 메타데이터를 사용자 포크로 통일했다. README 두 언어의 다운로드·업데이트 안내를 수정했다.
- 원본은 출처 표시·읽기 대상으로 유지하며 원본 릴리스는 설치 대상으로 거부한다.
  체크섬·버전 비교·파일 크기·HTTPS 리다이렉트 검증은 유지한다.
- 원본 추적 `main` 동기화의 자동 릴리스를 막기 위해 `push`/태그 트리거를 없앴다.
  `workflow_dispatch`만 허용하고 실제 저장소와 ref가 포크의 `develop`인지 확인한 뒤 진행한다.
  배포 workflow를 실행하거나 릴리스를 게시하지 않았다.
- 중요한 운영 한계: `origin/main`에는 옛 `main`/`v*` push 트리거가 그대로 남아 있다.
  GitHub는 이벤트 ref의 workflow를 읽으므로 `develop` 수정만으로 그 실행까지 차단하지는 않는다.
  main을 원본 그대로 유지하려면 동기화 전에 옛 Release workflow의 저장소 수준 비활성화 등
  별도 운영 조치가 필요하다. 이번 작업은 로컬 코드만 수정했고 Actions 설정·main·원격 태그는 건드리지 않았다.
  근거: [GitHub workflow 실행 기준](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows).
- 포크에 정식 릴리스가 없으면 조회 불가 상태를 반환하고 원본으로 대체하지 않는다.
  현재 원본 앱은 포크 빌드를 한 번 수동 설치해야 하며 이후 높은 버전의 포크 릴리스를 제공해야 한다.
- Node `22.23.4`의 업데이트·릴리스 관련 모의 검사 45개 통과. 실제 Windows 설치/롤백,
  Linux AppImage 메타데이터 생성, GitHub Actions 배포 실행은 미검증이다.
  전체 `npm test`: **752개 중 751 통과, 실패 0, skip 1**, 종료 코드 0.
  최초 전체 검사에서 Windows 업데이트 helper의 옛 원본 URL fixture를 발견해 포크 URL로 수정한 뒤 재검사했다.
  로그는 저장소 밖 `dev-tools/logs/codepet-fork-update-*.log`.
- 이전 모델·추론 작업과 포크 전용 규칙은 각각 PR #1/#2가 `develop`에 병합된 로컬 기준선
  `eb635b0`에서 시작했다. 이번 작업은 별도 worktree이며 푸시·PR 생성은 수행하지 않는다.

## 2026-11-04 / P0·P1 / feat/model-effort-continuity

### Codex의 최초 기준선 시도와 환경 제약 (이후 Claude의 검증 보고는 아래 참고)

- GitHub `develop` 기준 커밋: `ebba5704dc520d345c572a8efdea0e9f07c6bf8f`.
- `.nvmrc`는 Node `22.23.4`; 사용 가능한 시스템 Node는 `22.17.0`, npm은 `10.9.2`.
  추가 확인한 Codex 내장 Node는 `24.22.1`로 지정 버전과 다르다.
- Node 배포 서버 연결 검사: `curl.exe -I --connect-timeout 8 --max-time 15
  https://nodejs.org/dist/v22.23.4/SHASUMS256.txt`가 연결 실패로 종료했다.
  지정 Node를 확보하지 못했으므로 해당 버전 검증은 완료하지 않았다.
- `npm ci --offline --cache <workspace-cache> --no-audit --no-fund`: 종료 코드 1.
  `yocto-queue-0.1.0.tgz` 캐시 누락(`ENOTCACHED`). 일부 정리에는 `EPERM`도 발생했다.
  의존성 설치 성공으로 기록하지 않는다.
- 현재 작업 브랜치에서 `npm test`: Node `22.17.0`, 종료 코드 0,
  총 737개 중 736 통과, 1 skip, 0 실패. CLI/네트워크/실기기 연동 성공을 뜻하지 않는다.
- `npm run dist -- --win`: 종료 코드 1, `electron-builder` 모듈 누락.
  Windows 빌드·앱 실행 검증은 완료하지 않았다.
- 설치/테스트/빌드의 로컬 로그는 저장소 밖 워크스페이스의 `dev-tools/logs/`
  `codepet-ci.log`, `codepet-continuity-test.log`, `codepet-continuity-build.log`에 있다.

### Codex의 최초 실제 CLI 시도와 미검증 항목

- Claude Code `2.1.308`; Codex CLI `0.164.0`의 `--version`과 도움말을 확인했다.
- Claude 실제 첫 호출: 도구를 끄고 `-p`, `--output-format json`, `--max-turns 1`로
  `Reply only OK. Do not use tools.`를 요청했다. 기존 wrapper의 config 경로를 사용했으나
  stdout/stderr 응답 없이 대기했다. 제한 시간 뒤에도 남은 해당 테스트 프로세스를 종료했다.
  원인이 네트워크인지 인증인지 확정하지 않았으며, 추론 성공·과금 여부도 확인하지 못했다.
- Codex 실제 첫 호출: 기존 런타임 설정에서 `exec --skip-git-repo-check --sandbox read-only
  --json`으로 같은 최소 요청을 보냈다. `failed to initialize in-process app-server client:
  액세스가 거부되었습니다. (os error 5)`로 종료 코드 1. 런타임 임시 경로 접근 경고도 있었다.
- 이 실행 환경에서는 양쪽 모두 성공한 첫 세션을 얻지 못했다. 같은 ID 재개, 모델·추론 변경 후 맥락 보존,
  계정별 지원 조합, 실제 적용값 보고 범위는 **미검증**이다.
  이를 재개 미지원으로 판정하거나 자동으로 새 세션으로 바꾸지 않는다.

### 문서·소스에서 확인한 인터페이스

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)는 `thread/resume`과
  같은 `threadId`의 `turn/start`에서 `model`, `effort` 재지정을 명시한다.
  `model/list`의 `supportedReasoningEfforts`를 사용해야 하며 실제 계정 목록 조회는 남아 있다.
- [Claude CLI](https://code.claude.com/docs/en/cli-reference)는 `--resume`, `--model`,
  `--effort`를 제공하고 설치 도움말도 이를 확인했다. 설치 도움말의 effort 선택지는
  `low/medium/high/xhigh/max`지만 특정 모델의 지원 여부까지 검증한 결과는 아니다.
- 기존 `chat-ipc.js`의 scope에는 모델·추론이 포함돼 있었다. `NativeSessionLink`는 scope의
  SHA-256만 저장하므로 이전 요청값이 바뀐 뒤 단순히 현재 값으로 legacy hash를 만들면
  옛 연결을 찾지 못할 수 있다. 기존 Codex home 마이그레이션과 함께 다뤄야 한다.
- 기존 `chat-room.js`의 `respond()`는 현재 agent 객체를 참조하고 완료 때 요청값을 읽었다.
  아래 구현에서 시작 시점 snapshot을 승인 재시도까지 유지하도록 수정했다.

### 도구 승인 조사

- [Claude 비대화형 실행 문서](https://code.claude.com/docs/en/headless)에 따르면
  `acceptEdits`는 모든 셸/네트워크 도구를 승인하지 않는다. `-p`에서 승인 host가 없으면
  별도 allow rule 등으로 해결되지 않은 요청은 거부된다. 현재 argv에는 `acceptEdits`만 있고
  `--allowedTools`나 승인 host 연결이 없다. 개별 실패의 실제 원인 재현은 아직 안 됐다.
- `--allowedTools`는 명시한 도구/규칙의 사전 허용이지 호출별 사용자 승인 응답 채널이 아니다.
  [CLI 문서](https://code.claude.com/docs/en/cli-reference)의 `--permission-prompt-tool`과
  SDK `canUseTool` callback이 호출별 승인 경로의 후보다. 현재 `--strict-mcp-config`와
  함께 쓰려면 승인 MCP를 명시적으로 구성하고 ID·만료·취소 검증이 필요하다.
- 현재 `chat-room.js`의 승인 경로는 일부 실패 후 `autoApprove`로 전체 실행을 재시도한다.
  새 호출별 승인 UI는 실제 양방향 어댑터 검증 후 연결해야 하며, 광역 허용으로 대체하지 않는다.

### Claude의 P0/P1 검증 보고 (2026-11-04)

다음은 같은 채팅에서 총괄 Claude가 전달한 별도 실행 환경의 실측 보고다.
Codex가 같은 유료 호출을 반복하거나 직접 실공급자 검증한 결과로 표시하지 않는다.

- Node `22.23.4`에서 `npm ci`, Windows 빌드, 패키지 준비 검사 `PASS`.
  Node 위치: 워크스페이스 `dev-tools/temp/node-22.23.4/node-v22.23.4-win-x64`.
- 수정 전 전체 테스트: 736 통과/1 skip/0 실패. 당시에는 `CLAUDE_CONFIG_DIR` 제거가 필요했다.
  변수가 있으면 Grok 계정 테스트가 실패했고, 이번 수정에서 fixture가 공급자별 env를 읽도록 고쳤다.
- 최초 전체 실행에서 3개 실패가 있었다고 보고했으나 실패 이름/상세 기록은 없으며,
  이후 4회 재실행에서 재현되지 않았다고 보고했다. 원인이 확인되지 않은 미해결 사항으로 남긴다.
- Claude `2.1.308`: sonnet → haiku로 변경하고 같은 session ID를 재개해 코드워드 `PLUM` 보존.
  `system.init.model`과 `assistant.message.model`에서 실제 모델 확인.
  `result.modelUsage`에는 이전 모델도 들어 있어 실제 턴의 모델 판단에서 제외한다.
- Codex `0.164.0`: `gpt-6.1-sol` → `gpt-5.6-luna`로 변경하고 같은 thread ID에서 `PLUM` 보존.
  `exec --json`에서 실제 모델·추론 보고는 확인하지 못했다.
- 추론 플래그가 오류 없이 수락됐지만 실제 적용은 양쪽 모두 미검증.
  위 조합 외 모델/추론 조합과 수정된 CodePet 앱의 실공급자 흐름은 아직 검증하지 않았다.

### 이번 구현과 자동 검증 (Codex)

- 세션 scope에서 모델·추론을 제외하고 계정·home·작업폴더·권한·자동 승인 경계를 유지했다.
- 옛 scope는 요청 모델/추론과 `default`의 최대 네 조합으로만 찾는다.
  Codex의 기존 source-home → private-home 기록 복사와 함께 마이그레이션한다.
  복사 실패 시 기존 cursor를 보존하며 오류를 알린다.
- 옛 hash가 복구되지 않으면 새 CLI 세션으로 시작하고, 해당 턴의 메시지 ID까지의
  최근 대화(본인 답변 포함)를 최신 메시지부터 **256KiB 메시지 예산** 안에서 전달한다.
  메시지 JSON의 UTF-8 바이트로 계산하며 기본 역할 지침·첨부 전달 설명·작업 기록 안내는 별도다.
  예산 초과 시 오래된 메시지를 생략하고, 최신 메시지 하나가 너무 크면 본문 일부와 메타데이터를 줄인다.
  생략 사실은 프롬프트와 실행 상태 문구 양쪽에 표시한다. 저장된 원본 대화는 변경하지 않는다.
  다른 참가자의 늦은 답변은 해당 턴 snapshot에 섞지 않는다.
- 턴 시작 시 agent 설정을 복사해 준비·실행·승인 재실행·메시지 저장까지 요청값을 고정한다.
  변경한 모델·추론은 다음 턴에서 읽는다.
- 현재 Claude argv는 이미 `stream-json`이다. 해당 턴의 main `system.init.model`을 읽고
  `assistant.message.model`로 보강한다. subagent와 누적 `modelUsage`는 제외한다.
  성공/실패 메시지의 `agentMeta.model/effort`는 요청값이며 `appliedModel`은 확인값만 기록한다.
  Codex `appliedModel`과 양쪽 `appliedEffort`는 확인되지 않아 기록하지 않는다.
- Codex의 `item.type: error` 중 `This session was recorded with model...` 경고를 무시한다.
  다른 item 오류와 `turn.failed`는 계속 오류로 처리한다.
- `saved-chat-accounts.test.js`의 가짜 probe는 공급자에 맞는 환경 변수만 읽는다.
  사용자 환경 변수 삭제나 전역 설정 수정이 필요하지 않다.
- 최초 구현 후 Codex 환경의 지정 Node `22.23.4` `npm test`: **745개 중 744 통과, 실패 0, skip 1**.
  이후 Claude가 환경 변수에 따른 별도 fixture 오류를 재현했다. 이 최초 결과만으로
  `chat-native-sessions.test.js`의 환경 독립성을 확인한 것은 아니었다.
  로그: 저장소 밖 `dev-tools/logs/codepet-continuity-final-test.log`.
- 별도 `CLAUDE_CONFIG_DIR=unrelated-fixture-claude`, `GROK_HOME=unrelated-fixture-grok`에서
  계정 테스트 5개 전부 통과. 로그: `dev-tools/logs/codepet-continuity-env-test.log`.
- 변경 후 Codex 환경의 지정 Node에서 `npm run dist -- --win`: 종료 코드 1,
  외부 HTTPS 연결의 `connect EACCES`로 실패했다. 이후 Claude는 **같은 변경 코드**를
  자기 환경에서 Windows 빌드·패키지 준비 검사까지 통과했다고 보고했다.
  EACCES는 Codex 샌드박스 제약으로 보이며 제품 빌드 실패로 일반화하지 않는다.
  로그: `dev-tools/logs/codepet-continuity-implemented-build.log`.
- 모의 통합 테스트는 모델/추론 변경 후 재시작, 옛 hash 복구, 110개가 넘는 과거 메시지 전달,
  Codex rollout 복사, 준비/승인 중 설정 변경, 실제 모델 이벤트/누적값 분리를 검사한다.
  이 결과를 변경된 앱의 실제 공급자·브라우저·Android 검증으로 간주하지 않는다.

### Claude의 변경된 실행부 실제 검증과 리뷰 수정

총괄 Claude 보고: 임시 저장소의 `createChatFeature`를 실제 CLI에 연결해 아래를 확인했다.
앱 화면의 버튼을 직접 누른 검증과 구별한다.

| 공급자 | 1턴 → 2턴 요청 모델 | 결과 | 실제 적용 메타데이터 |
|---|---|---|---|
| Claude | sonnet → haiku (`low`) | 같은 session ID, 2턴 `PLUM`, 오류 표시 없음 | `claude-sonnet-5-5` → `claude-haiku-5-5` |
| Codex | `gpt-6.1-sol` → `gpt-5.6-luna` (`low`) | 같은 thread ID, 2턴 `PLUM`, 오류 표시 없음 | `appliedModel` 비움 |

- 실제 CLI의 앱 재시작 후 재개와 `low` 실제 적용 여부는 미검증이다.
- 리뷰에서 무제한 복구 컨텍스트를 지적해 위 256KiB 예산과 생략 안내를 반영했다.
- 리뷰에서 `chat-native-sessions.test.js`가 외부 `process.env.CLAUDE_CONFIG_DIR`로
  home을 계산해 743 통과/1 실패가 난다고 보고했다. fixture가 반환한 주입 `options.env`를
  기준으로 계산하도록 수정했다. 사용자 환경 변수나 제품 설정은 바꾸지 않았다.
- `CLAUDE_CONFIG_DIR=unrelated-fixture-claude`를 설정한 지정 Node의 관련 검사 30개 전부 통과.
  최근 메시지 선택·256KiB 예산·UTF-8 안전 축약·누락 snapshot·생략 안내를 검사했다.
  로그: `dev-tools/logs/codepet-recovery-review-focused.log`.
- 같은 환경 변수 설정을 유지한 Node `22.23.4`의 `npm test` 최종 결과:
  **총 748개 중 747 통과, 실패 0, skip 1**, 종료 코드 0.
  로그: `dev-tools/logs/codepet-recovery-review-full.log`.

남은 문제 (이번 단위에서는 변경하지 않음):

- `autoApprove`가 scope에 남아 승인 재실행과 다음 일반 턴에서 CLI 세션이 초기화될 수 있다.
  다음 단위인 도구 호출별 승인에서 처리한다.
- scope 초기화 후 첫 응답 전에 실패하면 다음 턴은 복구 경로 대신 최근 40개만 전달한다.
- 최초 전체 테스트 실패 3건은 상세 기록이 없고 후속 실행에서도 재현되지 않아 원인이 미확인이다.

다음 작업: Claude의 최종 전체 테스트·재리뷰. 도구 호출별 승인은 다음 단위에서 다룬다.

## 다음 실행 단위

사용자가 구현을 요청하면 **P0 기준선 확인 → P1 기술 검증**부터 진행한다.

1. `develop` 기준으로 작업 브랜치를 만들고 현재 설치/인증/CLI 버전 확인.
2. 저장소 지정 Node에서 기존 테스트와 Windows 실행/빌드 기준선 기록.
3. Claude config/명령 wrapper와 계정별 저장소가 일치하는지 재현.
4. Codex App Server와 Claude의 양방향 승인/세션 후보를 최소 예제로 검증.
5. 기존 Chrome 연결, Codex 브라우저 재사용 경로, 모델 변경 후 세션 연속성 확인.
6. 확인한 결과와 선택한 인터페이스를 기록한 뒤 P2 작업 범위를 확정.

## 먼저 해결할 질문

- Claude 연동 방식이 기존 로그인·세션·Chrome을 함께 유지할 수 있는가?
- Codex의 현재 브라우저는 CodePet의 실행 환경에서 접근 가능한 연결인가?
- 공급자별 도구 승인을 일회/세션/작업공간 단위로 어디까지 강제할 수 있는가?
- 모델/추론 변경 시 실제 CLI가 같은 세션에서 유지하는 정보와 미지원 조합은 무엇인가?
- Android 첫 지원 OS/기기와 APK 서명·배포 방식은 무엇인가?
- 집 밖 연결과 앱 종료 상태 알림에 별도 중계/푸시가 필요한가?

이 질문들은 현재 계획 게시를 막지 않는다. 해당 기능 구현 전에 검증/결정한다.

## 2026-11-05 / 반복 지침 전송 최적화 / feat/compact-repeat-prompts

- `origin/develop` 기준선 `eb635b0`에서 분기했다. 포크 업데이트 채널 작업과 독립된 브랜치다.
  앞선 모델·추론 연속성과 포크 전용 규칙은 PR #1/#2 병합으로 기준선에 포함돼 있다.
- 첫 턴·새 CLI 세션·`scopeReset` 복구는 기존 전문을 보낸다. 말투·성격·이모티콘 사전의
  원래 문구는 수정하지 않았다. 이어가는 턴에는 규칙 유지 한 줄, 현재 활동 참가자,
  병렬/순차 여부, 해당 토론 턴과 새 대화 메시지만 보낸다.
- 권한·참가자·멘션 정책·작업 모드/캐릭터 정책·토론 진입 등으로 전문의 SHA-256이 바뀌면
  재전송한다. 동적 값(작업 중 참가자, 병렬 순서, 토론 턴 번호, 메시지)은 해시에서 제외한다.
  전체 문구와 작업 기록 규칙 자체의 코드 변경도 해시에 반영한다.
- `NativeSessionLink`에 `promptRulesHash`와 `promptTurnCount`를 저장한다.
  세션의 첫 턴과 20·40·60번째 턴에 전문을 보내며, 앱 재시작 후에도 주기가 유지된다.
  구버전 cursor에 이 정보가 없으면 처음에는 전문을 보낸다.
- 실제 도구/응답/성공 결과로 전달이 확인된 뒤에만 카운터를 기록한다.
  델타 이벤트나 작업 기록 조회로 subprocess가 반복돼도 같은 논리 턴은 한 번만 센다.
  취소·삭제·stale cursor의 저장 방어는 유지한다.
- 이어가는 턴의 작업 기록 안내는 JSON 목록과 짧은 사용법으로 줄였다.
  `[[CODEPET_TRACE:...]]` 형식, 답변당 조회 제한, 비신뢰 도구 출력 경고를 유지한다.
  실제 조회 결과에 대한 경고와 페이지/fragment 처리 코드는 유지한다.
- Node `22.23.4`, `CLAUDE_CONFIG_DIR=unrelated-fixture-claude`를 유지한 전체 `npm test`:
  **755개 중 754 통과, 실패 0, skip 1**, 종료 코드 0.
  로그: 저장소 밖 `dev-tools/logs/codepet-compact-full.log`.
- 모의 통합 검사: Claude/Codex 41턴, 중간 앱 재시작, 20/40번째 전문 재전송,
  참가자 이름 변경 후 전문 재전송, scope 초기화, 작업 기록 조회의 턴 중복 계산 방지.
  실제 CLI에서 성격·이모티콘·호출 준수와 압축 후 성능이 유지되는지는 Claude가 별도로 검증한다.

프롬프트 바이트 비교: `node scripts/measure-chat-prompts.js`로 재현한다.
두 참가자·쓰기 모드·짧은 사용자 메시지·가상 기록 2개의 동일한 이어가기 턴을 비교했다.

| 공급자 | 기존 전문 방식 | 새 간략 방식 | 감소 |
|---|---:|---:|---:|
| Claude | 6,107 bytes | 1,328 bytes | 4,779 bytes (78.3%) |
| Codex | 6,105 bytes | 1,328 bytes | 4,777 bytes (78.2%) |

메시지·작업 기록 목록의 실제 크기에 따라 감소율은 달라진다. 바이트 비교이며 실제 토큰 수,
과금·지연·캐시 효율·모델 성능 개선을 측정한 결과는 아니다. 첫 턴과 주기적 갱신은 전문 크기를 유지한다.
이 worktree에는 의존성을 설치하지 않았고 Windows 새 빌드·유료 공급자 호출은 하지 않았다.
로컬 커밋 후 푸시·PR 없이 총괄 리뷰와 실제 CLI 검증에 넘긴다.

실제 CLI 검증: Claude `haiku`·Codex `gpt-5.6-luna`로 3턴 대화에서 2·3턴을 축약 규칙으로 보냈고,
코드워드 기억, 이모티콘 사용, 참가자 미호출을 유지했다. 표본이 작아 20턴 재전송과 CLI 압축 후 동작은 미검증이다.

## 다음 작업자가 남길 기록

각 작업에서 아래 형식으로 갱신한다.

```text
날짜 / 단계 / 브랜치 또는 PR:
바뀐 동작:
검증: 명령·버전·결과, 모의/실공급자/실기기 구분
미확인 사항·회귀·제약:
다음 작업:
로드맵·기술 결정 변경이 있으면 이유:
```

문서 게시·설정 구문 검사·UI 모형·실제 성공을 구별한다.
문서가 GitHub에 올라간 사실은 커밋 링크와 원격 파일을 확인한 후 보고한다.
