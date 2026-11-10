# 진행 상태와 다음 작업

기준일: **2026-11-11 (Asia/Seoul)**

## 현재 상태

**Windows 최신 배포는 v1.2.6이다. 이번 PR #18에는 Claude 호출별 승인·공통 규칙 연결과 UI, Claude UI 검토 이월 과제를 함께 담았다. 실제 Claude CLI + 로컬 모의 공급자·Electron UI·개발용 Windows 폴더 빌드를 검증했으며 실제 구독 모델의 새 승인 흐름은 미검증이다. 사용자 요청으로 기존 #18만 갱신하고 병합·릴리스는 하지 않는다. MCP 연결·실행 환경 별도 편집 등과 P1/P2/P3 전체 완료는 후속이다.**

| 항목 | 상태 | 근거/메모 |
|---|---|---|
| 공개 Fork 확보 | 확인 | `sangguk-kwon/CodePetMODnMOBILE`, 원본 `nokryong/CodePet` |
| 원본 기준선 | 소스 기준 확인 | v1.2.2, `ca3d5c1ce2d7f96e904deb68ac88c660b8251371` |
| 개발 지침·구조·로드맵 | 작성 | 이 커밋의 AGENTS와 docs 문서 |
| 기존 테스트/앱 빌드 | v1.2.6 검증 완료 | 2026-11-08 Node 22.23.4: 791 통과, 실패 0, skip 1. Windows 패키지 준비·버전·IPC·정상 종료 확인 |
| Claude/Codex 실제 연동 | 변경된 실행부에서 제한된 조합 확인 | Claude 보고: createChatFeature + 실제 CLI로 모델 변경 후 동일 세션/스레드와 코드워드 보존. 추론 실제 적용은 미검증 |
| Chrome/Codex 브라우저 | P1 예정 | 기존 연결 재사용 선호만 확정 |
| PC 새 기능 | 일부 구현·배포 | 모델·추론 연속성, 날씨 버튼 겹침 수정, 반복 지침 축소. 지원 조합 확대·호출별 승인·브라우저 검증은 남음 |
| 도구 설정·호출별 승인 | v1.2.6 배포 + PR #18에 Claude 승인·규칙 연결 구현 | 두 공급자의 CLI 요청에 일회 승인·정확 일치 규칙 적용. Claude 추가분은 미병합·미배포. 실제 구독 공급자·MCP/브라우저·환경 편집 후속 |
| 실시간 작업 진행 보고 | 계획 등록, 미구현 | Phase 1 이벤트 기반 누적 이력, Phase 2 공개 자연어 보고. Claude/Codex 공통 UI 필수. 기존 작업 순서 유지 |
| Android 프로젝트/APK | 미구현 | Kotlin/Compose 방향만 문서화 |
| 원격 서버·페어링·알림 | 미구현 | 서비스 배포/포트 공개/기기 연결 없음 |
| 개조판 업데이트/릴리스 | Windows v1.2.6 게시 완료 | 포크 조회·재다운로드 체크섬·패키지 실행 검증 완료. 설치된 앱의 실제 업데이트 교체·승인 실사용은 별도 확인 필요 |

단계별 완료 여부는 아래 기록의 검증 범위에 따른다. 위 배포 사실만으로 PC 전체 흐름이나
Android 개발 완료를 뜻하지 않는다. 과거 기록의 미검증 항목은 이후 기록과 함께 읽는다.

## 계속 이월하는 과제

- [ ] **`CLAUDE-UI-REVIEW` / 담당 Claude / 미완료** — [UI 검토·자유 재구성 과제](CLAUDE_UI_REVIEW.ko.md). 사용량 부족으로 현재 UI 구현·검증은 Codex가 맡는다. Claude의 실제 검토 근거가 생길 때까지 후속 작업·PR·릴리스에도 계속 이월하며 자동 호출하지 않는다. Codex 자체 검증으로 완료 처리하지 않는다.

## 2026-11-11 / PR #18 사용자 확인용 Windows 미리보기 빌드

- 사용자 요청으로 PR #18의 소스 `92d1c81`을 이 Windows PC에서 Node `22.23.4`로 portable exe 빌드했다. `artifacts/pr18-preview/CodePet-PR18-preview.exe`, 체크섬 `SHA256SUMS`, 근거 `preview-report.json`을 로컬에 준비했다. 정식 버전은 올리지 않아 앱 내부 표시는 `1.2.6`이다.
- portable exe의 격리된 임시 데이터 경로에서 준비·IPC·버전·정상 종료 검사를 통과했다. app.asar의 Claude 승인 실행기·공통 runner·IPC·도구 설정·설정 UI가 소스와 일치함을 확인했다. 로그: 저장소 밖 `dev-tools/logs/codepet-pr18-preview-build.log`.
- 기능 코드는 이전 799 통과 결과에서 바뀌지 않았다. 현재 실행 중인 사용자 앱은 종료하지 않았으며 실제 구독 계정의 승인 흐름·사용자 화면 확인은 후속이다. PR #18 병합·릴리스 게시·원본 저장소 변경은 하지 않았다.
- **계속 이월:** `CLAUDE-UI-REVIEW` 미완료. 사용자 미리보기 빌드와 Codex 검증으로 Claude의 검토를 대신하지 않는다.

## 2026-11-10 / Claude 호출별 승인·공통 규칙 연결 / PR #18

- 사용자 요청으로 별도 기능 PR을 만들지 않고 기존 [PR #18](https://github.com/sangguk-kwon/CodePetMODnMOBILE/pull/18)의 `docs/claude-ui-review-handoff` 브랜치에 기능을 추가했다. 구현·UI·검증은 Codex 담당이며 병합은 사용자가 한다.
- 설치된 Claude native CLI의 양방향 stream-json 제어 프로토콜을 선택했다. 기존 CLI/계정 환경을 그대로 전달하며 별도 SDK 의존성·API 인증 전환·시스템 프롬프트 교체를 추가하지 않았다. 기존 runner의 종료·취소·출력 제한을 재사용한다.
- 작업공간 쓰기·전체 자동 승인 끔에서 `default` 권한 모드를 사용한다. 기존 `acceptEdits` 자동 편집 허용에서 전환되며 CLI가 전달한 요청만 개별 확인한다. 초기화·유효 세션 ID·재개 대상·실제 시작 폴더·권한 모드·최종 결과를 확인하고, 실패를 전체 권한 우회 재실행으로 바꾸지 않는다. 폴더를 바꾸는 CLI 래퍼도 불일치하면 실행을 중단한다.
- 공통 `CallApprovals`의 세션·계정·실행·revision·만료·취소와 창 재로딩 복원을 재사용한다. Claude Bash·Write/Edit의 정확 일치 allow/deny 규칙을 연결했고 전체 자동 승인과 규칙 동시 사용을 두 공급자 모두 거부한다. 도구 제외도 유지한다.
- 파일 본문·비공개 추론·권한 제어 프레임은 승인 카드에 복사하지 않는다. 샌드박스 해제 요청과 긴 내용 생략은 명시한다. 허용 시 원본 입력만 돌려주고 permission suggestions/updatedPermissions는 저장하지 않는다. 알 수 없는 제어 요청·별도 질문 UI는 명시적으로 미지원 처리한다. 기존 CLI 규칙이 먼저 허용한 호출까지 통제한다고 표시하지 않는다.
- 하위 작업/세션 실행 상태가 남아 있으면 첫 result만 보고 승인 채널을 닫지 않는다. 최종 idle 뒤 종료한다. API 결과의 `is_error`를 success subtype보다 우선해 실패를 성공으로 표시하는 경우도 수정했다.
- Node `22.23.4` 전체 테스트: **799 통과, 실패 0, skip 1**. 새 wire-protocol 검사 6개·Claude IPC 검사·전체 턴 우회 금지 검사와 기존 Codex/Grok/AGY·계정·세션 회귀를 포함한다. 기존 retry 검사 일부는 해당 호환 경로를 유지하는 AGY로 옮겼다. 로그: 저장소 밖 `dev-tools/logs/codepet-claude-approval-full.log`.
- 설치된 Claude `2.1.308` + 루프백 Anthropic 모의 공급자로 Bash/Write 일회 허용·거부, 규칙 허용·거부, 파일 생성 여부와 같은 세션 ID 재개를 확인했다. 격리된 임시 설정과 가상 API 키만 쓰고 실제 구독 인증/외부 모델을 사용하지 않았다. `artifacts/claude-approval-smoke/1794321118286/report.json`; 로그 `dev-tools/logs/codepet-claude-approval-native.log`.
- 실제 Electron renderer/preload/IPC + 모의 어댑터에서 Claude 승인·거부·중복 클릭·세션 전환·재로딩 복원·취소와 공통 설정의 Claude 규칙 저장을 확인했다. 화면 캡처를 Codex가 검토했다. `artifacts/chat-call-approval-smoke/1794320577575/`, `artifacts/chat-tool-settings-smoke/1794320081228/`. 기존 Codex 승인 UI 회귀도 통과했다. 이 결과는 Claude 본인의 UI 검토가 아니다.
- 개발용 Windows x64 폴더 패키지 빌드와 준비·IPC·버전·정상 종료 검사 통과. 공개 릴리스용 portable 파일은 만들거나 게시하지 않았고 v1.2.6 태그/자산도 바꾸지 않았다. 로그: `dev-tools/logs/codepet-claude-approval-build.log`. 이 개발 빌드의 앱 버전은 아직 `1.2.6`이다.
- 한계/후속: 실제 구독 계정의 새 승인 흐름, 장시간 하위 작업과 CLI 버전별 동작은 미검증이다. AskUserQuestion/MCP 질문·연결 관리와 실행 환경 편집은 미구현이다. Claude 명령 규칙의 폴더는 CLI 시작 작업공간이며 셸의 실제 현재 폴더나 전체 영향 범위 검증을 뜻하지 않는다.
- **계속 이월:** `CLAUDE-UI-REVIEW`는 미완료로 유지한다. 이번 구현·테스트·Codex 화면 검토로 완료 처리하지 않으며 향후 Claude가 실제 검토한 근거를 남겨야 한다.

## 2026-11-10 / UI 담당 변경·Claude 검토 과제 이월

- 사용자 지시로 이후 UI 구성까지 Codex가 담당한다. 앞서 합의한 Claude 호출별 승인·공통 규칙 연결·검증·포크 PR 범위는 유지하며, UI 구성만을 위해 Claude를 호출하던 방침을 변경한다.
- `CLAUDE-UI-REVIEW`를 별도 문서·로드맵·AGENTS 작업 지침과 UI 소스 TODO에 등록했다. Claude가 나중에 UI 배치·문구·스타일·상호작용을 자신의 판단으로 자유롭게 재구성할 수 있다는 사용자 허용도 기록했다.
- 이 과제는 실제 검토 날짜·범위·결과·검증 근거가 남기 전까지 미완료로 유지한다. 부분 검토·Codex 테스트·PR 병합·릴리스로 지우거나 완료 처리하지 않는다.
- 초기 등록은 담당/이월 규칙과 코드 주석 변경뿐이었고 앱 테스트·빌드·릴리스·Claude 모델 호출은 수행하지 않았다. 이후 같은 PR에 구현·검증을 추가한 결과는 위 기록을 따른다.

## 2026-11-08 / v1.2.6 배포 검증 / docs/release-1.2.6-verification

- 사용자 지시로 Windows x64 portable을 이 PC에서 로컬 빌드해 [v1.2.6 릴리스](https://github.com/sangguk-kwon/CodePetMODnMOBILE/releases/tag/v1.2.6)에 게시했다. GitHub Actions로 빌드하지 않았다. 원본 저장소에는 원격 변경을 만들지 않았다.
- 버전 변경 [PR #16](https://github.com/sangguk-kwon/CodePetMODnMOBILE/pull/16)을 develop에 병합하고 커밋 `d06fd732916be43e31254c2decb239c4daacc60d`에서 빌드했다. 테스트한 PR head와 병합 커밋의 트리 차이가 없음을 확인했다. `v1.2.6` 태그도 같은 커밋을 가리킨다.
- Node `22.23.4`, `npm ci` 후 전체 테스트 **791 통과, 실패 0, skip 1**. `npm run dist -- --win` 및 자동 패키지 준비·버전 `1.2.6`·IPC·정상 종료 검사 통과. 로그는 저장소 밖 `dev-tools/logs/codepet-v126-tests.log`, `codepet-v126-build.log`.
- 패키지의 app.asar에서 버전과 새 도구 설정·Codex 승인·preload·채팅 UI 모듈이 빌드 소스와 일치함을 확인했다. 설치 시 npm audit가 보고한 `@electron/get` 하위 undici 다운로드 도구는 app.asar에 포함되지 않음을 확인했다. 보안 경고 전체 해결이나 내장 Electron/Node 보안 검증 완료를 뜻하지 않는다.
- `CodePet-1.2.6.exe`와 `SHA256SUMS`를 초안에 올리고 실제 파일을 다시 받아 원본·체크섬 파일과 일치하는지 검사한 뒤 최신 정식 버전으로 공개했다. 크기 **170,576,110 bytes**, SHA-256:
  `137c4a0986549d586aced9642aa7b562df9fc1ea876bf60196b818b2ad38a8b8`.
- 공개 후 실제 앱 업데이트 검사 모듈로 `1.2.5`에서 `available`, 최신 버전 `1.2.6`, 포크 exe/체크섬 URL을 확인했다. `1.2.6`에서는 `up-to-date`를 확인했다. 로그: 저장소 밖 `dev-tools/logs/codepet-v126-update-check.json`.
- 현재 사용 중인 앱을 종료하거나 실제 업데이트 교체를 실행하지 않았다. 실제 구독 모델의 새 승인 흐름·파일 변경 요청, Claude 호출별 승인·MCP/브라우저 연결·실행 환경 편집과 Android는 이번 검증 완료 범위가 아니다.

## 2026-11-08 / v1.2.6 릴리스 준비 / chore/release-1.2.6

- 사용자 요청으로 PR #15까지 병합된 포크 `origin/develop` (`1af5605`)에서 준비한다. 버전·lockfile·설정 화면을 `1.2.6`으로 올리고 한영 변경 내역을 추가했다.
- 범위는 도구·권한 진단, Codex 호출별 승인, Claude 도구 제외, Codex 정확 일치 승인 규칙과 범위별 저장이다. 미구현·미검증 항목은 변경 내역에도 명시했다.
- Windows 로컬·지정 Node `22.23.4`에서 의존성 재설치 후 전체 테스트·패키지 실행·버전/IPC·체크섬을 검증하고 사용자 포크에만 게시한다. 이 준비 기록은 빌드 성공이나 릴리스 게시 완료를 뜻하지 않는다.
- `npm ci` 후 전체 테스트 **791 통과, 실패 0, skip 1**. 로그: 저장소 밖 `dev-tools/logs/codepet-v126-tests.log`. 설치 시 npm audit가 기존 의존성 경고를 보고했다. 별도 보안 업데이트를 섞거나 자동 수정하지 않았으며 이 결과를 보안 검사 통과로 표현하지 않는다.
- 실제 구독 모델의 새 승인 흐름, Claude 호출별 승인, MCP/브라우저·환경 편집과 Android는 이번 릴리스 완료 범위가 아니다.

## 2026-11-08 / 공통 도구 설정·허용 규칙 / feat/common-tool-settings

- 사용자 요청으로 최신 `origin/develop` (`d650023`, PR #14 병합)에서 구현했다. Claude는 별도 CLI로 UI 파일 구성과 UI 후속 수정만 맡았다. Codex가 백엔드·저장·실행 연동·문서·검증을 담당했다.
- 참가자 설정의 `도구·허용 규칙` 패널에서 도구 사용 가능 여부와 승인 규칙을 구분한다. Claude는 Read/Grep/Glob/Edit/Write/Bash/WebSearch/WebFetch의 CLI 제외 옵션, Codex는 작업공간 쓰기·전체 자동 승인 끔에서 정확한 명령/파일 승인 규칙을 지원한다. 미지원 제어는 비활성화한다.
- `tool-settings.json`은 공급자·계정·설정 홈·작업공간별로 나눈 CodePet 전용 저장소다. 같은 범위를 다른 대화에서도 공유하며 재시작 후 유지한다. 전역 CLI 파일·계정 인증·기존 체크박스 값은 자동 변경하지 않는다.
- revision 충돌·다른 범위의 revision·실행 중 저장을 거부한다. 규칙과 전체 자동 승인의 동시 사용도 거부한다. CLI 세션 scope에 정책을 포함하고 설정 변경 시 최근 대화를 복구한다. 규칙 판정은 요청/실행/권한/계정 유효성을 확인한 뒤 수행하고 같은 실행에 accept/decline만 돌려준다.
- 거부 우선·명령 전체/작업 폴더 exact match·모든 파일 개별 일치·작업공간 밖/링크/디렉터리·추가 권한·네트워크 자동 허용 제외를 구현했다. 알려진 비밀값 형태의 명령 저장을 거부하고 판정 이력에는 원문 명령/파일 본문을 넣지 않는다. 이 규칙은 **CLI 승인 요청에만 적용되며 모든 샌드박스 작업을 가로채는 ACL이 아니다.**
- Node `22.23.4` 전체 테스트: **791 통과, 실패 0, skip 1**. 신규 10개 단위/IPC 검사는 저장/재시작·범위 격리·revision·손상/미지원 데이터·비밀값·거부 우선·정확 일치·파일/링크·실행 중 저장·실행 인자 반영을 확인했다. 기존 계정 테스트 모의 서비스에 읽기 전용 settingsContext 계약을 추가했다. 로그: 저장소 밖 `dev-tools/logs/codepet-common-tools-test.log`.
- 실제 Codex `0.164.0` + 루프백 모의 공급자: 기존 한 번 승인 이후 저장한 정확 일치 규칙으로 같은 요청 허용/거부·파일 생성 여부·스레드 재개를 확인했다. 실제 인증 사본/외부 모델 호출 없음. `CODEPET_SMOKE_RULES=1 node scripts/smoke-codex-approvals.js`, 결과 `artifacts/codex-approval-smoke/1794138801365/report.json`.
- 실제 Electron 렌더러/preload/IPC + 모의 실행기: 저장/삭제·중복 클릭·비밀값 거절 후 초안 유지·규칙에 따른 허용/거부·새로고침 후 저장값 유지·Claude 도구 제외·오래된 응답/저장 무시·세션 전환 후 이전 설정 닫기를 검사하고 두 공급자 화면 캡처를 검토했다. 검토 중 발견한 자동 승인 거절 후 체크박스 복원과 펼친 패널의 화면 밖 넘침도 수정했다. `scripts/smoke-chat-tool-settings.js`, 결과 `artifacts/chat-tool-settings-smoke/1794139287652/`. 로그: 저장소 밖 `dev-tools/logs/codepet-common-tools-ui.log`.
- 미구현/미검증: Claude 호출별 규칙, MCP/브라우저 연결 관리, 실행 환경 별도 편집, 기존 CLI 규칙 명시적 가져오기·충돌 해석, 실제 구독 모델 작업과 새 Windows 패키지. 현재 설치 앱에는 아직 반영되지 않았다. 진행 보고/Android·원본 저장소·릴리스는 변경하지 않았다.
- 후속 작업과 보장 한계는 [공통 도구 설정](TOOL_SETTINGS.ko.md)에 기록했다. 구현 커밋 `f135021`을 사용자 포크의 develop 대상 [PR #15](https://github.com/sangguk-kwon/CodePetMODnMOBILE/pull/15)로 게시했다. 병합·릴리스는 하지 않았다.

## 2026-11-08 / Codex 호출별 승인 / feat/codex-tool-approvals

- 최신 `develop` (`bdd5d47`, PR #12/#13 병합)에서 작업했다. Codex의 `workspace-write` + 자동 승인 끔에만 새 App Server 경로를 사용한다. 기존 읽기/대화·명시적 전체 자동 승인 경로와 Claude/Grok/AGY 실행은 유지한다.
- `CallApprovals`로 세션·참가자·실행·임의 요청 ID를 결합하고 이번 요청 허용/거부만 전달한다. 중복·잘못된 세션·권한/계정 변경 후 응답을 거부하고, 기본 5분 만료·취소·서버 요청 해제 시 정리한다. 승인 재개는 같은 실행에서 이뤄지며 Codex의 전체 턴 우회 재시도는 제거했다.
- 명령·파일 변경 요청을 카드로 표시한다. 명령과 대상 경로·이유는 비밀 값 제거·길이 제한을 적용하며 파일 본문은 카드에 복사하지 않는다. 네트워크 승인은 같은 대상의 묶인 요청을 함께 해제할 수 있음을 안내한다. 세션 허용/영구 규칙 변경은 보내지 않는다.
- 설치된 Codex `0.164.0`의 일반/experimental JSON Schema와 [공식 App Server 문서](https://learn.chatgpt.com/docs/app-server)를 확인했다. 이 버전은 legacy `sandbox` 설정만으로는 읽기 전용 응답이 나와 `permissionProfile/list`에서 허용된 내장 작업공간 프로필을 선택하도록 연결했다. 구형 CLI의 메서드 미지원은 legacy 경로로 검증하되, 권한/작업폴더 불일치 시 모델 턴 시작 전에 중단한다.
- `config/read`에서 허용 목록에 있는 승인/샌드박스 값과 출처만 읽고, 실제 thread 시작/재개 응답의 권한을 확인한다. 마지막 실행에서 확인된 값은 진단 화면에 시각과 함께 표시한다. 네트워크 기본 허용·작업공간 밖 추가 쓰기 경로·자동 심사자로 바뀌면 실행하지 않는다.
- 실제 설치된 CLI + 로컬 Responses 모의 서버: 허용 시 시험 폴더의 파일 생성, 거부 시 미생성, 같은 thread 재개를 확인했다. 실제 외부 모델·사용자 인증 사본은 사용하지 않았다. 일부 거부가 `interrupted`로 끝나는 CLI 동작은 명시적인 거부 종료로 표시한다. 로그: 저장소 밖 `dev-tools/logs/codepet-approval-native.log`.
- Node `22.23.4` 전체 테스트: **781 통과, 실패 0, skip 1**. 로그: 저장소 밖 `dev-tools/logs/codepet-call-approval-full.log`. 승인 격리·만료·중복·취소·권한 불일치·프로필 선택·재개·비밀 값 제외와 Codex 우회 재실행 금지를 검사했다.
- 실제 Electron 렌더러/preload/IPC + 모의 실행기로 허용/거부·중복 클릭·다른 세션에서 카드 숨김/복원·새로고침 후 대기 승인 복원·취소를 확인했고 캡처도 검토했다. 로그: 저장소 밖 `dev-tools/logs/codepet-call-approval-ui.log`.
- 미확인/범위: 실제 구독 공급자와 장시간 대화, App Server 파일 변경 요청의 실제 모델 호출, 새 Windows 패키지는 미검증이다. 추가 파일/네트워크 권한 grant, MCP 질문/elicitation·동적 도구는 아직 지원하지 않으며 임의 허용하지 않는다. 샌드박스 내에서 이미 허용된 모든 도구 사용마다 묻는 기능은 아니다.
- 기존 Windows 샌드박스 준비·소스 인증/격리 세션·스킬·말투 지침·모델/추론과 trace 전달 경로를 재사용한다. 사용자 전역 설정·원본 저장소·릴리스를 변경하지 않았다. 실시간 진행 보고는 계획만 유지한다.
- 다음 작업: 포크 PR 검토·병합 후 실제 구독 경로 검증과 Claude 호출별 승인 어댑터. 진행 보고 및 기존 우선순위는 임의로 바꾸지 않는다.

## 2026-11-08 / 도구 설정·호출별 승인 계획 / docs/tool-permission-plan

관련 후속 구현: PR #13에 도구·권한 진단 UI를 올렸다. 이 계획 문서 등록과 호출별 승인 구현 완료는 구분한다.

- 사용자가 공식 앱처럼 CodePet 화면에서 도구·권한을 설정하고 실행 중 승인하는 경험을 구현 계획에 넣도록 요청했다.
- `ROADMAP.ko.md`에 환경 진단 → Codex 승인 → Claude 승인 → 공통 설정 화면 → 규칙 저장/이전 → 통합 검증의 순서·단계·완료 기준을 추가했다. 전 항목은 예정 상태다.
- `ARCHITECTURE.ko.md`에 도구 연결·승인 정책·실행 환경을 분리하고 공급자별 capability로 적용 범위를 표시하는 설계를 반영했다.
- 기존 설정·말투·성격 지침을 보존하고, 공식 앱 전체 기능 동등성이나 설정 자동 동기화는 약속하지 않는다. 기존 전역 CLI 설정을 묵시적으로 수정하지 않는다.
- 진행 요약의 오래된 릴리스 미게시·미커밋 UI 설명을 실제 v1.2.5 게시 기록에 맞춰 정리했다.
- 문서 변경만 수행했다. 변경 범위·문서 링크·형식을 검사하며 앱 테스트나 실공급자 호출은 수행하지 않는다.
- 다음 작업은 설치된 CLI의 실제 설정·권한·연결 진단이다. Codex 단독으로 진행하고 Claude 실공급자 검증은 사용량을 고려한다.

## 2026-11-08 / 실시간 작업 진행 보고 계획 추가 / docs/tool-permission-plan

- 사용자 요청으로 `PROGRESS_UPDATES.ko.md`를 추가하고 로드맵 P3 TODO와 문서 입구에 연결했다. 앱 코드는 변경하지 않았다.
- 현재 코드의 status 덮어쓰기·본문 스트리밍·tool trace·run IPC를 검토했다. Phase 1은 이를 재사용해 추가 LLM 호출·토큰 없이 누적 진행 이력을 제공하는 계획이다.
- Claude Code와 Codex를 같은 UI·상태 규칙의 필수 대상으로 명시했다. Gemini는 현재 전용 provider/파서가 없어 별도 지원 조사 대상으로 등록했으며 기존 AGY와 구분했다. Grok/AGY 회귀 검증도 포함했다.
- Phase 2는 공개 자연어 중간 메시지·final 구분·설정과 비용 검토 후 추진한다. 비공개 추론·민감 내용 노출과 추측 보고는 금지한다.
- 난이도는 Phase 1 중하, Phase 2 중상으로 예상한다. 도구 성공과 전체 검증 완료를 혼동하지 않기, ID/중복/종료 처리, 이력 보존과 민감 정보 제외를 주요 위험으로 기록했다.
- 기존 도구별 승인·브라우저 연결 작업의 순서와 우선순위를 변경하지 않았다. 문서 링크·내용·변경 범위만 검사하고 앱 테스트·실공급자 호출·릴리스는 수행하지 않는다.

## 2026-11-05 / v1.2.5 릴리스 / chore/release-1.2.5

- 사용자 요청으로 PR #9가 병합된 포크 `develop` (`086c0e2`)에서 별도 작업 폴더를 만들었다.
- 버전·lockfile·설정 화면 표기를 `1.2.5`로 올리고, 한영 릴리스 노트에 고화질 PNG 교체와 프레임 경계 수정을 기록했다.
- Windows 로컬, Node `22.23.4`, `npm ci` 후 전체 테스트: **763 통과, 실패 0, skip 1**.
  버전 관련 릴리스 검사도 15개 통과했다. 로그: 저장소 밖 `dev-tools/logs/codepet-v125-tests.log`.
- Windows x64 portable 빌드 및 패키지 실행 검사 통과: 준비 상태·IPC·버전 `1.2.5`·정상 종료 확인.
  빌드 로그: 저장소 밖 `dev-tools/logs/codepet-v125-build.log`.
- PR #10을 포크 `develop`에 병합했고, `2ffd9fb5ce5ebde5f7499691c89c161e62e04a06`에 `v1.2.5` 태그를 만들었다.
- [v1.2.5 릴리스](https://github.com/sangguk-kwon/CodePetMODnMOBILE/releases/tag/v1.2.5)를 정식 최신 버전으로 게시했다. exe와 `SHA256SUMS`를 제공한다.
  exe 크기: 170,563,404 bytes. 다시 다운로드한 파일의 SHA-256도 로컬과 일치했다:
  `d14c20003dd2b98c99c32dfdfaf92a128739fad2c36d7927c3c43900a55edd62`.
- 실제 앱 업데이트 검사 모듈로 포크를 조회해 `1.2.4`에서 `available` 및 exe/체크섬 URL, `1.2.5`에서 `up-to-date`를 확인했다.
  실제 설치된 앱의 업데이트와 펫 시선 정확도는 사용자 확인이 필요하다.
- 모든 원격 변경은 사용자 포크 `sangguk-kwon/CodePetMODnMOBILE` 안에서만 수행한다.

## 2026-11-05 / 클로드 펫 프레임 경계·화질 수정 / fix/claude-pet-hd-frames

- 사용자 실사용 화면에서 프레임 위에 이전 행의 하단 조각이 보이는 문제를 확인했다.
  기존 생성기는 간격이 일정하지 않은 1024x1536 원본 전체를 확대하고 등분해서 잘못된 행이 섞였다.
- 내장 image_gen 도구로 기존 클로드 이모티콘을 참고해 이동·반응·작업·시선·검토 원본을 따로 생성했다.
  실제 생성 원본은 모두 1024x1536이며, 대다수 셀은 가로 256px, 검토 셀은 512px다.
  이전 원본의 셀 가로 128px보다 실제 원본 디테일을 늘렸다. 단순 확대만 한 수정은 아니다.
- 원본은 `build/claude-pet-hd/*.png`, 생성 프롬프트·실제 프레임 매핑 주의사항은 같은 폴더 README에 있다.
  재생용 자산은 `src/pets/claude/spritesheet.png` (3072x4576, 13,930,078 bytes)다.
  출력 시트 크기는 기존 가로·세로 2배지만 리샘플링을 포함하므로 프레임별 네이티브 4K를 뜻하지 않는다.
- 재생 자산은 실제 알파를 유지하는 무손실 PNG다. 앱의 경로와 data URL MIME도 PNG에 맞췄다.
  기존 클로드 WebP는 제거했으며 기본 펫과 외부 펫의 WebP 처리는 유지한다.
- 생성기는 Node만으로 재현된다: `node scripts/generate-claude-pet.js`.
  투명한 행 사이를 찾아 각 프레임을 독립 분리하고, 주 캐릭터와 분리된 이웃 조각을 제거한다.
  원본의 주 캐릭터가 잘리는 경우 오류로 중단하며, 배치 시 사방 24px 여백을 둔다.
- 9개 상태·16방향 슬롯, 총 73개 프레임을 유지했다. 기쁨 루프는 실제 생성된 4개 포즈 중
  한 포즈를 되돌아오는 프레임에 재사용한다. 시선 방향의 정확성·실제 재생의 자연스러움은 사용자 검수가 필요하다.
- Node 22.23.4, `CLAUDE_CONFIG_DIR`가 설정된 전체 검사: **763 통과, 실패 0, skip 1**.
  로그: 저장소 밖 `dev-tools/logs/codepet-hd-pet-tests.log`.
  PNG 압축 필터 최종 조정 후 관련 검사 10개도 통과했다. 시트 전체를 육안으로 확인했다.
  이웃 조각 제거, 불균일 행에서 머리 보존, PNG 알파 보존, 73개 프레임 여백·빈 셀 검사를 추가했다.
- 실제 앱·고배율에서의 재생과 변경 후 Windows 패키지 실행은 아직 확인하지 않았다.
  기존 배포본은 자동으로 바뀌지 않는다. 이 단위는 새 릴리스 게시를 수행하지 않았다.
  디코딩 픽셀 수가 이전의 4배라서 앱 로딩·메모리 사용도 실제 검증 대상으로 남긴다.

## 2026-11-05 / v1.2.4 릴리스 준비 / chore/release-1.2.4

- 사용자가 클로드 펫 릴리스 게시를 요청했다. PR #7은 포크 `develop`에 병합된 상태이며,
  소스 기준은 `bd78d6ade8005d6225e19019edc94521dfc07bbc`다.
- 버전을 `1.2.4`로 올리고 lockfile·설정 화면의 버전 표시·영문/한글 릴리스 노트를 맞췄다.
- Node `22.23.4`의 전체 테스트: **760개 중 759 통과, 실패 0, skip 1**.
  최초 실행에서 설정 화면의 옛 버전 표기를 발견해 수정한 뒤 재검사했다.
  로그: 저장소 밖 `dev-tools/logs/codepet-v124-tests.log`.
- 이 Windows PC의 기존 Electron `44.9.3` 배포본과 빌드 도구 캐시를 사용해 포터블을 패키징했다.
  기본 빌드의 Electron 다운로드가 `EACCES`로 실패해 설치된 동일 버전 배포본을 지정했다.
  앱 소스·리소스 처리·패키지 준비 검사를 생략하거나 다른 Electron 버전으로 바꾸지 않았다.
- 새 패키지의 격리 실행 검사가 종료 코드 `2147483651`로 실패했다.
  사용자가 정상 실행을 확인한 기존 `1.2.3` 배포본도 같은 환경에서 같은 코드로 실패하므로
  Codex 실행 환경의 제한이 의심된다. 새 앱의 실행 성공으로 기록하지 않는다.
  패키지 준비 검사를 통과할 수 있는 별도 환경에서 재검증하기 전에는 게시하지 않는다.
- 미게시 패키지 후보와 체크섬·노트는 워크스페이스 `dev-tools/temp/codepet-v124-release/`에 준비한다.
  후보 `CodePet-1.2.4.exe`: 157,158,918 bytes, 파일/제품 버전 `1.2.4`.
  SHA-256: `7e35273e43375aea06bd2d17875a8540798fd7463ad32cde73db3bde8d0b908a`.
  `SHA256SUMS`와 `RELEASE_NOTES.md`를 같은 폴더에 생성했다. 이 값은 로컬 후보의 해시이며 게시 확인은 아니다.
  빌드 로그: `dev-tools/logs/codepet-v124-build-cached.log`, `codepet-v124-build-preserved.log`.
  비교 실행 로그: `dev-tools/logs/codepet-v123-sandbox-smoke.log`.
- 현재 Codex 환경은 GitHub HTTPS 직접 연결이 거부되고 `gh auth status`도 실패했다.
  연결된 GitHub 도구로 병합·릴리스 정보 읽기는 가능하지만 릴리스/바이너리 업로드 도구는 없다.
  원격 브랜치·태그·릴리스는 아직 변경하지 않았다. 원본 저장소는 수정하지 않는다.
- 다음 단계: Claude 환경에서 후보 exe의 패키지 준비 검사 → 포크 `develop`에 버전 커밋 반영 →
  동일 소스의 포크 `v1.2.4` 게시 → 업로드 파일 재다운로드·SHA-256·업데이트 조회 검증.
  실제 펫 표시·시선 정확도와 앱 업데이트 버튼으로 실행 파일을 교체하는 흐름은 별도 확인이 필요하다.

## 2026-11-05 / 클로드 펫 / feat/claude-pet

바뀐 동작: 펫 선택에 내장 "클로드"를 추가했다. 기본 펫은 그대로다. 기본 펫과 같은 11행(1536x2288) 규격이라
16방향 시선을 포함한 모든 상태를 쓴다. 프레임마다 표정과 포즈가 다르다.

자산: Codex CLI 0.164.0 이미지 생성으로 클로드 이모티콘을 참고해 만든 `build/claude-pet-source.png`를
`scripts/generate-claude-pet.js`로 배경 제거·시선 행 정렬해 만든다. 소스는 앱에 포함되지 않는다.

검증: 전체 테스트, 규격 검사, 미리보기 시트 육안 확인. 실제 앱 화면과 시선 방향의 정확도는 미검증이다.

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

## 2026-11-08 / 도구·권한 진단 첫 구현 / feat/tool-permission-diagnostics

- 계획 문서는 사용자 포크 PR #12에 게시했다. 이 구현은 최신 `develop` (`e6709fd`)에서 별도 분기했으며, 문서 PR과 독립적으로 검토할 수 있다.
- Claude/Codex 참가자 설정에 읽기 전용 `도구·권한 진단`을 추가했다. 다음 일반 턴의 실제 실행 인자 생성기를 사용해 승인 모드·샌드박스·도구/MCP 옵션을 표시한다.
- 선택 계정의 설정 경로·격리 실행 경로·프로젝트 설정 후보를 구분한다. Claude JSON의 허용/확인/거부 규칙은 개수와 알려진 도구 종류만 표시하고, 명령 인자·토큰·hooks·env 내용은 보내지 않는다.
- 진단 IPC는 세션과 참가자를 검사하고, renderer가 지정한 파일 경로를 사용하지 않는다. 저장된 계정의 인증 준비·설정 복사·토큰 갱신 없이 경로를 확인한다. 설정 파일 읽기는 256KiB로 제한한다.
- 기존 자동 승인 동작은 유지한다. Codex의 샌드박스 해제와 Claude의 MCP 연결 제외를 화면에 설명한다. 권한 설정 변경과 호출별 승인 어댑터는 아직 구현하지 않았다.
- Node `22.23.4` 전체 테스트: **770 통과, 실패 0, skip 1**. 추가한 7개 검사는 권한 모드 조합, 비밀 값 제외, 잘못된 파일, 계정 구분과 IPC 입력 검증을 다룬다.
  로그: 저장소 밖 `dev-tools/logs/codepet-permission-full.log`.
- `scripts/smoke-tool-permissions.js`로 실제 Electron 렌더러·preload·IPC·임시 설정 파일을 연결해 두 공급자 화면, 새로고침, 규칙 개수, 비밀 값 제외, 이전 세션의 늦은 결과 무시를 확인했다. 화면도 캡처해 확인했다.
  설치된 동일 버전 Electron 실행 파일을 사용했으며, 사용자 앱을 종료하거나 설정을 바꾸지 않았다. 공급자 레코드·계정·설정은 모의 데이터다.
- 한계: TOML은 파일 존재만 확인한다. CLI의 최종 합산 권한·상위 폴더/OS 관리자 정책·실제 네트워크/TLS/GitHub 인증·Windows 샌드박스 실행은 미검증으로 표시한다. Claude 유료 호출과 새 릴리스는 수행하지 않았다.
- 다음 작업: 실제 설정 출처·지원 capability 진단을 보강하고 Codex 호출별 승인 어댑터를 연결한다. 이 첫 PR로 계획 1단계 전체나 도구별 승인 완료를 선언하지 않는다.

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
