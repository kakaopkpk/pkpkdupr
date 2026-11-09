@AGENTS.md

# 작업 방식

- 코드 변경을 요청받으면 `/fix-issue` 스킬 플로우로 진행한다 (이슈 생성·구현·PR·리뷰·머지까지).
- 여러 이슈를 묶어 진행할 때는 `/orchestrate-task`를 쓴다. 설정은 `.claude/orchestrate.config.json`.
- 이슈 제목은 `<type>: <한국어 요약>`(type은 `feat`, `fix`, `refactor`, `chore`), PR 제목은 `#<이슈번호>: <요약>` 형식이다.

# 검증

- 빌드: `pnpm build`
- 테스트: `pnpm --filter @pkpkdupr/api --filter @pkpkdupr/shared test`
- `pnpm lint`는 현재 eslint 의존성이 설치되어 있지 않아 실패한다. 검증 명령으로 쓰지 않는다.

# 진행 중인 이전 작업

Supabase(DB·Auth·Storage·Edge Functions) + GitHub Pages로 옮기는 중이다. 범위와 순서는 이슈 #1~#10을 따른다.
