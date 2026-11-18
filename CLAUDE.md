@AGENTS.md

# 작업 방식

- 이슈 제목은 `<type>: <한국어 요약>`(type은 `feat`, `fix`, `refactor`, `chore`), PR 제목은 `#<이슈번호>: <요약>` 형식이다.
- 도메인·디자인 결정이 확정되면 개인 메모가 아니라 저장소 문서에 반영한다. 제품 원칙·거절한 안은 `docs/product.md`, 디자인 결정은 `docs/design.md`, 구현 규칙은 `AGENTS.md`·`apps/web/AGENTS.md`다. 경과가 아니라 지금 유효한 결론을 쓴다.
- 디자인 시안·캔버스는 `.claude/skills/design-canvas/SKILL.md` 순서로 만든다.

# 검증

- 빌드: `pnpm build`
- 테스트: `pnpm --filter @pkpkdupr/api --filter @pkpkdupr/shared --filter @pkpkdupr/web test`
- `pnpm lint`는 현재 eslint 의존성이 설치되어 있지 않아 실패한다. 검증 명령으로 쓰지 않는다.
