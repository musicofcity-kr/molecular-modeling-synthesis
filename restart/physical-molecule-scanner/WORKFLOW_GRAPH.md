# WORKFLOW_GRAPH.md — Graph-First Development

## 0. 그래프 실행 규칙

이 파일은 전체 작업 지도를 정의한다.

Codex는 전체 그래프를 읽을 수 있지만,
**실제 작업은 `CURRENT_NODE.md`에 지정된 노드 하나에서만 수행한다.**

각 노드는 다음 구조를 가진다.

**INPUT → TASK → OUTPUT → PASS → FAIL ROUTE → NEXT**

PASS가 아니면 다음 노드로 이동하지 않는다.

---

# 전체 그래프

```text
[N0 Repository Map]
        ↓
[N1 Learning Experience]
        ↓
[N2 Image → Atom Candidates]
        ↓
[N3 Bond Confirmation → Molecular Graph]
        ↓
[N4 Chemistry Validation → Identity]
        ↓
[N5 Scientific Reference 3D + Measurement]
        ↓
[N6 Physical vs Reference + Structure Coach]
        ↓
[N7 Classroom Integration QA]
```

보조 루프:

```text
N2 불확실 ──→ 사용자 확인/재촬영 ──→ N2
N3 비정상 연결 ──→ 결합 수정 ──→ N3
N4 화학검증 실패 ──→ N3
N5 Reference 생성 실패 ──→ N4
N6 오개념/UX 문제 ──→ N1 또는 N6
N7 회귀/수업성 문제 ──→ 원인 노드로 회귀
```

---

# N0 — Repository Map

## INPUT
- 기존 분자구조 모델링 프로젝트
- PROJECT_INTENT.md

## TASK
기존 프로젝트에서 새 기능에 실제로 재사용할 수 있는 요소를 찾는다.

확인 대상:
- 프론트엔드 기술 스택
- 3D molecular viewer
- RDKit 또는 화학 엔진
- SMILES/InChI 처리
- 원자 선택
- 결합길이/결합각 계산
- PubChem 등 구조 데이터 연결
- 상태관리
- 테스트/빌드/배포 구조

## OUTPUT
`graph-output/N0_REPOSITORY_MAP.md`

반드시 포함:
- 확인된 사실
- 재사용 후보
- 새 구현이 필요한 부분
- 부모 프로젝트 수정 위험
- N1에서 알아야 할 제약

## PASS
- 기존 기능을 추측이 아니라 실제 코드 근거로 분류했다.
- 재사용 가능/불가/미확인을 구분했다.
- 부모 프로젝트를 아직 불필요하게 수정하지 않았다.
- N1 설계에 필요한 현실적 제약이 정리됐다.

## FAIL ROUTE
N0 내부 재조사.

## NEXT
N1

---

# N1 — Learning Experience

## INPUT
- PROJECT_INTENT.md
- N0_REPOSITORY_MAP.md

## TASK
코드를 먼저 만들지 말고 학생의 end-to-end 학습 경험을 설계한다.

핵심 질문:
> 학생은 각 화면에서 무엇을 보고, 무엇을 선택하고, 무엇을 생각하고, 다음에 무엇을 하는가?

## OUTPUT
`graph-output/N1_LEARNING_EXPERIENCE.md`

최소 포함:
- 5~7단계 학생 흐름
- 각 단계의 학생 행동
- 각 단계의 핵심 화면 요소
- 사용자가 수정할 수 있어야 하는 지점
- 오류/불확실성 시 다음 행동
- Physical/Reference가 처음 분리되어 보이는 지점
- 기술적으로 꼭 필요한 기능과 불필요한 기능

## PASS
- 고등학생이 무엇을 해야 하는지 단계별로 명확하다.
- 기술 이름보다 학생 행동이 먼저 정의되어 있다.
- AI 자동인식이 실패해도 학습 흐름이 끊기지 않는다.
- N2~N6 기능이 이 흐름에서 필요하다는 이유가 설명된다.

## FAIL ROUTE
N1 UX만 수정한다. 기술 구현으로 도피하지 않는다.

## NEXT
N2

---

# N2 — Image → Atom Candidates

## INPUT
- N1_LEARNING_EXPERIENCE.md
- 기존 UI/이미지 처리 가능성

## TASK
사진에서 원자 후보를 제시하고 학생이 확인·수정할 수 있는 가장 작은 기능을 만든다.

초기 전략 우선순위:
1. 분자키트의 색상/형태 규칙
2. 간단한 결정론적 이미지 처리
3. 필요할 때만 Vision/AI 후보 제시

AI가 원자를 최종 확정하지 않는다.

## OUTPUT
- 실제 동작하는 이미지 입력
- 이미지 위 원자 후보 표시
- 원자 종류 수정 UI
- 불확실 상태 표현
- 필요하면 재촬영/다른 사진 안내
- 테스트 fixture는 DEMO라고 명시

코드 + `graph-output/N2_RESULT.md`

## PASS
- 최소 1개 대표 이미지에서 전체 입력→후보→수정 흐름이 동작한다.
- 잘못 인식된 원자를 학생이 수정할 수 있다.
- 불확실한 후보를 강제 확정하지 않는다.
- 픽셀 정보가 실제 결합길이로 오용되지 않는다.

## FAIL ROUTE
N2에서 인식/수정 UX를 반복 개선.

## NEXT
N3

---

# N3 — Bond Confirmation → Molecular Graph

## INPUT
- N2에서 확정된 원자 목록/위치 후보
- 기존 molecular data model

## TASK
결합 후보를 만들고 학생이 수정한 뒤 molecular graph를 생성한다.

## OUTPUT
- 결합 후보 표시
- 결합 추가/삭제/필요시 결합차수 수정
- 확정된 molecular graph
- 데이터 구조가 Physical Model임을 명시
- `graph-output/N3_RESULT.md`

## PASS
- 학생이 잘못된 결합을 수정할 수 있다.
- molecular graph가 원자/결합 정보를 일관되게 보존한다.
- Reference 3D 데이터를 Physical Model에 덮어쓰지 않는다.
- N4에 전달할 구조가 명확하다.

## FAIL ROUTE
N3 내부 수정.
화학적 유효성 문제는 N4가 판단하되 구조 데이터 자체 오류는 N3에서 해결.

## NEXT
N4

---

# N4 — Chemistry Validation → Molecule Identity

## INPUT
- N3 molecular graph

## TASK
결정론적 화학 검증을 우선하여 구조를 검증하고 가능한 분자 정체를 찾는다.

확인:
- 원자가/결합수
- 그래프 연결성
- 결합차수
- 분자식
- 기존 RDKit 등 구조 유효성 검사
- 제한된 MVP 분자 후보

## OUTPUT
- validation result
- 가능한 분자 identity 또는 복수 후보
- 실패 이유와 학생이 수정해야 할 지점
- `graph-output/N4_RESULT.md`

## PASS
- 잘못된 구조를 정상 분자처럼 통과시키지 않는다.
- 모르는 경우 모른다고 표시한다.
- 복수 후보면 임의로 하나를 사실처럼 확정하지 않는다.
- N5가 사용할 검증된 graph/identity를 제공한다.

## FAIL ROUTE
구조 입력 문제 → N3
검증 로직 문제 → N4

## NEXT
N5

---

# N5 — Scientific Reference 3D + Measurement

## INPUT
- N4에서 검증된 molecular graph/identity
- N0에서 확인한 기존 3D/측정 기능

## TASK
Scientific Reference 3D를 생성 또는 조회하고 탐색·측정 기능을 연결한다.

## OUTPUT
- 회전/확대/축소 가능한 Reference 3D
- 원자 선택
- 원자 2개 → Reference distance
- 원자 3개 → Reference angle
- 데이터 출처/유형 구분
- `graph-output/N5_RESULT.md`

## PASS
- Reference 3D가 실제로 표시되고 조작된다.
- 측정값이 Reference 좌표로부터 계산됨이 명확하다.
- Physical Model의 막대 길이나 픽셀거리를 Å로 표시하지 않는다.
- 기존 viewer를 재사용했다면 회귀 문제가 없다.

## FAIL ROUTE
identity/graph 문제 → N4
viewer/measurement 문제 → N5

## NEXT
N6

---

# N6 — Physical vs Reference + Structure Coach

## INPUT
- Physical Model
- Scientific Reference
- N1 학습 흐름

## TASK
두 구조의 차이를 학생이 관찰하고 설명을 수정할 수 있게 한다.

## OUTPUT
- Physical / Reference 명확한 비교 UI
- 차이가 보이는 구조적 단서
- Structure Coach
- 다시 만들기/다시 확인하기/설명 수정하기 행동
- `graph-output/N6_RESULT.md`

## PASS
- 학생이 두 구조를 혼동하지 않는다.
- 피드백이 단순 정답 제시로 끝나지 않는다.
- CH4 평면 제작, NH3 구조 오류 등 대표 오개념에서 수정 행동을 유도한다.
- 화학 설명이 검증된 구조정보와 일치한다.

## FAIL ROUTE
학습 흐름 문제 → N1
비교 UI/피드백 문제 → N6
Reference 문제 → N5

## NEXT
N7

---

# N7 — Classroom Integration QA

## INPUT
- N2~N6의 실제 동작 결과
- 기존 부모 프로젝트

## TASK
'기능이 존재하는가'가 아니라 '수업에서 쓸 수 있는가'를 검증한다.

대표 시나리오:
- CH4 정상 모형
- CH4 평면형 오개념
- H2O 원자 가림
- 잘못된 결합수
- 인식 실패 후 학생 수정
- 모바일 화면
- 기존 molecular modeling 기능 회귀

## OUTPUT
`graph-output/N7_CLASSROOM_QA.md`

포함:
- PASS/FAIL 시나리오
- Critical 문제
- 화학적 위험
- 학생 UX 위험
- 부모 프로젝트 회귀
- MVP 완료 여부
- 다음 버전으로 미룰 항목

## PASS
- 핵심 학생 흐름이 처음부터 끝까지 실제 동작한다.
- Critical 화학 오류 0.
- 핵심 버튼/상호작용이 작동한다.
- Physical/Reference 혼동이 없다.
- 기존 주요 기능 회귀가 없다.
- 미구현 항목은 미구현으로 표시된다.

## FAIL ROUTE
원인이 발생한 노드로 되돌아간다.

## NEXT
MVP COMPLETE
