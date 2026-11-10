# 공통 도구 설정과 허용 규칙

기준일: 2026-11-11. 표는 현재 개발 브랜치 기준이다. 공통 설정·Codex 규칙은 Windows
v1.2.6부터, 아래 Claude 호출별 승인·규칙 연결은 v1.2.7부터 배포됐다. 사용자 요청으로
v1.2.7은 미병합 PR #18 브랜치에서 게시했으며 PR 병합은 사용자 확인을 기다린다.

사용자 요청에 따라 Claude 호출별 승인 어댑터보다 공통 설정·규칙 저장을 먼저 구현했다.
브라우저·진행 보고·Android의 기존 우선순위는 변경하지 않았다.

## 지원 범위

| 항목 | Claude | Codex |
|---|---|---|
| 내장 도구 사용 중지 | Read/Grep/Glob/Edit/Write/Bash/WebSearch/WebFetch를 CLI 제외 옵션으로 전달. 읽기 모드에서는 앞의 세 항목만 변경 가능 | 개별 중지 미지원, 화면에서 비활성화 |
| 정확한 명령 승인 규칙 | 작업공간 쓰기·전체 자동 승인 끔에서 CLI가 요청한 Bash 승인에 적용 | 작업공간 쓰기·전체 자동 승인 끔에서 지원 |
| 정확한 파일 승인 규칙 | 같은 조건에서 Write/Edit 승인에 적용. Read/NotebookEdit는 수동 확인 | 같은 조건에서 개별 파일 대상으로 지원 |
| 규칙 기본 동작 | 기존 CLI/관리자 정책 이후 CodePet으로 전달된 요청을 개별 확인 | 맞는 규칙이 없으면 기존 호출별 승인 카드 표시 |
| MCP/브라우저 연결 추가·선택 | 미지원. 기존 strict MCP 설정 유지 | 미지원. 기존 CLI 구성 유지 |
| 실행 환경/샌드박스 별도 편집 | 후속 | 후속. 이 변경은 기존 제한을 넓히지 않음 |

체크된 도구는 CLI·관리자 정책이 허용하는 범위에서 사용할 수 있다는 뜻이다.
자동 허용 또는 도구가 현재 버전에서 반드시 제공된다는 보장이 아니다.
Claude에서 Bash를 끈다고 다른 도구의 파일/네트워크 접근까지 막지는 않는다.

**두 공급자의 승인 규칙은 모든 도구 호출에 대한 접근 제어 목록이 아니다.**
CLI가 CodePet에 보낸 승인 요청에만 적용한다. 기존 CLI/관리자 규칙이 먼저 허용·거부했거나
샌드박스 안에서 원래 승인 없이 가능한 작업은 이 규칙을 거치지 않는다. 관리자 정책을 우회하지 않는다.

## 저장과 적용

- 앱 채팅 저장소의 `tool-settings.json`에 버전 1로 원자 저장한다. 전역 CLI 설정·인증 파일은 쓰지 않는다.
- 공급자, 선택 계정 정체성/설정 홈, 정규화한 작업공간으로 범위를 나눈다. 같은 범위는 다른 대화에서도 공유한다. 작업공간이 없으면 대화별로 격리한다.
- 기존 자동 승인 체크박스를 마이그레이션하거나 자동 변경하지 않는다. 두 공급자 모두 규칙과 전체 자동 승인의 동시 활성화를 거부한다. 기존 저장값이 충돌해도 조용히 무시하지 않고 실행을 중단한다.
- revision은 범위에 묶인다. 오래된 화면이나 다른 계정·작업공간에서 받은 revision으로 저장할 수 없다.
- 같은 범위를 사용하는 실행이 있으면 다른 대화에서의 저장도 거부한다. 설정은 다음 실행에 적용한다.
- 도구 제외/규칙이 바뀌면 native session scope를 바꿔 새 CLI 세션에 최근 대화를 복구한다. 기존 기록을 덮어쓰거나 같은 작업을 재실행하지 않는다.
- 최대 100개 규칙, 규칙 내용 4,000자, 저장 범위 256개, 파일 4MiB로 제한한다. 손상·새 버전 파일은 기본 허용으로 복구하지 않고 실패를 표시한다.

## 규칙 의미

1. `kind`는 `command` 또는 `file`, `effect`는 `allow` 또는 `deny`다. 거부가 우선한다.
2. 명령은 **전체 원문과 적용 범위의 작업 폴더가 정확히 일치**해야 한다. 공백도 보존한다. 접두사/와일드카드/셸 파싱으로 권한 범위를 추정하지 않는다. Claude의 폴더는 CLI 실행 시작 작업공간이며, 셸에서 이동한 현재 폴더를 확인하는 값이 아니다. 같은 명령도 실행 파일·스크립트·환경·셸 현재 폴더가 바뀌면 결과가 달라질 수 있다.
3. 파일은 절대 경로로 입력한다. 모든 변경 파일에 개별 허용 규칙이 있어야 자동 허용한다. 하나라도 거부 규칙과 일치하면 요청 전체를 거부한다.
4. 파일 자동 허용은 작업공간 내부의 파일로 제한하고 링크·재분석 경로·다중 하드링크를 제외한다. 이는 승인 시점의 검사이며 OS 수준의 경로 격리를 대신하지 않는다.
5. 네트워크 묶음 승인, 디렉터리 `grantRoot`, 추가 권한 grant는 자동 허용하지 않는다. 정보가 부족한 요청은 추측해서 허용하지 않는다.
6. 네트워크를 제외한 명령/파일 요청에서 정확히 일치하는 거부는 추가 권한 요청이 있더라도 거부할 수 있다. 네트워크 승인은 별도 확인한다.
7. Codex는 `accept`/`decline`, Claude는 `behavior: allow/deny`로 한 번만 응답한다. Claude 허용 시 원본 도구 입력을 수정하지 않고 돌려준다. `acceptForSession`·`updatedPermissions`·CLI 영구 규칙 수정은 보내지 않는다.
8. 계정·권한·규칙 revision·실행 유효성을 확인한 후 평가하며 취소된 요청은 허용하지 않는다.

규칙에는 인증 정보를 입력하지 않는다. 알려진 비밀값 형태를 감지하면 저장을 거부한다.
모든 비밀값을 자동 탐지할 수 있다는 보장은 없으므로 실제 비밀은 환경/CLI 인증을 사용한다.
판정 이력은 규칙 ID·효과·실행 ID·revision만 기록하고 명령·파일 본문을 추가 기록하지 않는다.

## Claude 실행 경로

- `workspace-write` + 전체 자동 승인 끔에서 설치된 CLI의 양방향 `stream-json`과 `--permission-prompt-tool stdio`를 사용한다. 별도 SDK 의존성·API 키 전환·시스템 프롬프트 교체는 추가하지 않았다.
- 이전 `acceptEdits` 대신 `default` 승인 모드를 명시한다. 기본 파일 편집이 더 이상 CodePet의 편집 자동 허용으로 처리되지 않으며, 기존 CLI 정책이 넘긴 요청만 카드로 확인한다. 읽기/대화·명시적 전체 자동 승인 경로는 유지한다.
- 초기화 성공과 유효한 CLI 세션 ID를 확인한 뒤 요청을 처리한다. 재개 대상·세션·시작 폴더·승인 모드가 다르거나 최종 result가 없으면 실패로 표시한다. 폴더를 바꾸는 CLI 래퍼도 불일치하면 중단한다. 실패를 우회 플래그를 붙인 전체 턴 재실행으로 바꾸지 않는다.
- 기존 `CallApprovals`의 세션·계정·실행·설정 revision 확인, 기본 5분 만료, 창 재로딩 복원과 취소를 재사용한다. 제어 메시지는 도구 기록이나 채팅 본문에 전달하지 않는다.
- CLI의 취소 제어 메시지와 사용자 중지는 대기 승인을 취소한다. 결과 뒤에도 추적된 하위 작업이나 실행 상태가 남아 있으면 승인 채널을 유지하고, 최종 idle 상태에서 stdin을 닫는다.
- 원본 permission suggestions는 저장하지 않는다. 추가 접근 경로·샌드박스 해제 요청은 자동 허용하지 않는다. 별도 질문 UI가 필요한 AskUserQuestion/MCP·알 수 없는 제어 요청은 아직 지원하지 않아 명시적으로 거부한다.
- Bash·Read·Edit·Write·Grep·Glob·WebSearch·WebFetch·NotebookEdit 요청의 기본 카드를 지원한다. 카드에는 정제한 명령/대상만 표시하고 파일 본문·변경 내용·비공개 추론을 복사하지 않는다.
- 새 승인 경로는 native session scope를 구분한다. 첫 전환 때 최근 대화를 새 세션에 복구하고, 같은 경로의 이후 턴에서는 기존 세션을 재개한다. 모델·추론·말투·성격·스킬 관련 프롬프트 문구는 바꾸지 않았다.

## 코드와 검증

- `src/chat/tool-settings.js`: 검증·저장·공급자 capability·Claude argv 제외·공통 승인 규칙 평가.
- `chat-ipc.js`: 경로를 renderer에서 받지 않고 참가자·계정·작업공간으로 범위 계산, IPC, 실행 스냅샷, 중복/실행 중 저장 방지.
- `codex-approval-runner.js`: 비밀 제거된 표시 내용과 분리한 원본 대상 정보를 main 프로세스의 평가기에만 전달. 승인 브로커의 공개 payload에는 포함하지 않는다.
- `claude-approval-runner.js`와 `chat-agent-runner.js`: 기존 프로세스 종료/취소·스트리밍 처리 위에 초기화·요청·응답·취소의 양방향 제어를 연결한다. API 오류의 `is_error`를 success subtype보다 우선한다.
- `chat-tool-settings.js`와 채팅 UI: 실제 capability별 제어, 저장/새로고침/오류와 지원 범위 안내.
- `test/tool-settings*.test.js`: 저장/재시작/범위·revision 분리, 손상 데이터, 미지원 변경, exact match, 거부 우선, 다중 파일, 링크, 실행 중 저장, 실제 실행 인자/IPC 흐름.
- `CODEPET_SMOKE_RULES=1 node scripts/smoke-codex-approvals.js`: 실제 설치 Codex + 루프백 모의 Responses 공급자로 사용자 승인 후 동일 명령의 저장 규칙 허용·거부와 스레드 재개를 검사한다. 실제 계정/구독 모델 검증이 아니다.
- `CODEPET_SMOKE_CLAUDE=<설치된 native CLI 경로> node scripts/smoke-claude-approvals.js`: 실제 Claude CLI + 루프백 Anthropic 모의 공급자로 Bash/Write 일회 허용·거부, 규칙, 같은 세션 ID 재개를 검사한다. 격리된 임시 설정과 가상 API 키만 쓰며 실제 구독·외부 모델 호출은 하지 않는다.

참고: [Claude CLI 제외 옵션](https://code.claude.com/docs/en/cli-reference),
[Claude 승인 처리](https://code.claude.com/docs/en/agent-sdk/user-input),
[공식 Python SDK의 제어 프로토콜](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py),
[Codex App Server 승인 프로토콜](https://learn.chatgpt.com/docs/app-server).

남은 작업은 실제 구독 공급자 검증, 장시간 하위 작업/CLI 버전별 회귀, MCP/브라우저 연결 관리,
실행 환경 별도 설정과 기존 CLI 규칙의 명시적 가져오기·충돌 진단이다.
[`CLAUDE-UI-REVIEW`](CLAUDE_UI_REVIEW.ko.md)는 이번 Codex 구현·검증 후에도 계속 미완료로 이월한다.
