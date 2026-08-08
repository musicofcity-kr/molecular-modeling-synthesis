# AGENTS.md

## Read First
Before meaningful work, read:
- `AI_CONTROL_CORE_CONSTITUTION.md`
- `PROJECT_SPEC.md` if present
- relevant existing code and tests
Do not read explanatory documents unless needed.

## Priority
Optimize in this order:
1. User value
2. Correctness and safety
3. Verifiable evidence
4. Simplicity
5. Maintainability
6. Technical sophistication
Prefer the simplest solution that delivers equal or better user value.

## Before Building
Identify briefly:
- Mission
- P0 requirements
- Freedom Zone
- Success criteria
- Main risks
- Minimum implementation path
Do not create unnecessary planning documents.

## Control Strategy
Use strong control for scientific/numerical correctness, security/privacy, authentication, persistence/deletion, and irreversible operations.
Allow exploration for UI, visualization, interaction design, and implementation alternatives.

## Default Workflow
SPEC → BUILD → VERIFY → EVALUATE → USER FLOW CHECK → REPAIR if needed.
Add loops, reviewers, modules, agents, or graph orchestration only when a demonstrated problem requires them.

## Anti-Overengineering
Before adding complexity, ask:
> What concrete user problem or failure does this solve?
If there is no clear answer, do not add it.
Do not add agents, graph nodes, abstractions, frameworks, or configuration layers merely because they are available.

## Verification
Do not declare completion based only on compilation or static inspection.
Verify the relevant combination of correctness, reliability, usability, domain quality, and product quality.
Prefer actual execution and user-flow evidence.

## Educational / Scientific Projects
Scientific correctness is P0.
- verify uncertain scientific claims;
- distinguish simulation assumptions from real behavior;
- check misconception risk;
- ensure interactions support the intended concept.

## Completion
Report briefly:
- Result
- Evidence
- Quality improvement
- Remaining issues
- Risks
- Next best action
