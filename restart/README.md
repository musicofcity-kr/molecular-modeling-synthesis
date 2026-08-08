# Selective AI Control Package

AI 통제를 많이 하는 것이 아니라 **필요한 곳에 정확히 적용하고**, 품질 탐색이 필요한 영역에는 자유도를 남기기 위한 경량 개발 운영 패키지입니다.

## Folder Structure

```text
project/
├─ AGENTS.md
├─ AI_CONTROL_CORE_CONSTITUTION.md
├─ PROJECT_SPEC.md
├─ README.md
├─ src/
└─ tests/
```

이 패키지에는 다음 파일이 포함됩니다.

- `AGENTS.md` — AI가 항상 읽는 짧은 작업 라우터
- `AI_CONTROL_CORE_CONSTITUTION.md` — 상위 판단 원칙
- `PROJECT_SPEC_TEMPLATE.md` — 프로젝트별 요구사항 작성 템플릿
- `START_PROMPT.md` — 새 작업 세션 시작용 최소 프롬프트
- `docs/AI_CONTROL_CORE_CONSTITUTION_GUIDE.md` — 사람용 설명서
- `docs/AI_CONTROL_CORE_CONSTITUTION_INFOGRAPHIC.png` — 개념 인포그래픽

## Recommended Setup

1. 패키지의 `AGENTS.md`와 `AI_CONTROL_CORE_CONSTITUTION.md`를 프로젝트 루트에 둡니다.
2. `PROJECT_SPEC_TEMPLATE.md`를 복사해 `PROJECT_SPEC.md`로 이름을 바꿉니다.
3. 현재 프로젝트의 목적, 핵심 사용자, P0, 성공 기준만 간단히 작성합니다.
4. Codex/Claude Code에서 `START_PROMPT.md`의 프롬프트로 시작합니다.
5. 하네스·루프·그래프·멀티에이전트는 문제가 실제로 확인될 때만 추가합니다.

## Design Principle

> Precise Control + Structured Freedom + Strong Evaluation

즉,

- 실패 비용이 큰 곳 → 강하게 통제
- 품질 탐색이 필요한 곳 → 자유도 부여
- 완료 판단 → 실제 사용자 가치와 검증 가능한 증거

## Important

`docs/AI_CONTROL_CORE_CONSTITUTION_GUIDE.md`는 사람의 이해를 위한 설명서입니다. AI가 매 작업마다 반드시 읽을 필요는 없습니다.
