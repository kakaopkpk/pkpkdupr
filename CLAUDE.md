@AGENTS.md

# 작업 방식

- 이슈 제목은 `<type>: <한국어 요약>`(type은 `feat`, `fix`, `refactor`, `chore`), PR 제목은 `#<이슈번호>: <요약>` 형식이다.
- 여러 사람이 각자 Claude로 동시에 작업한다. 같은 일을 두 번 하지 않도록 다음을 지킨다.
  - 이슈를 시작하면 `gh issue edit <번호> --add-assignee @me`로 자신을 담당자로 지정한다. 다른 사람이 담당자인 이슈는 잡지 않는다.
  - 브랜치는 `issue-<번호>-<영문 요약>`으로 main에서 만들고, 워크트리에서 작업한다. main에 직접 push하지 않는다.
  - main을 따라잡을 때는 `git merge origin/main`으로 한다(rebase·force push 금지).
  - PR은 CI가 통과한 뒤 squash 머지한다. 본문에 `Closes #<번호>`를 넣는다.
  - 운영 배포는 GitHub Release 발행으로만 한다. 로컬에서 원격 `pnpm db:push`나 함수 배포를 하지 않는다.
- 도메인·디자인 결정이 확정되면 개인 메모가 아니라 저장소 문서에 반영한다. 제품 원칙·거절한 안은 `docs/product.md`, 디자인 결정은 `docs/design.md`, 구현 규칙은 `AGENTS.md`·`apps/web/AGENTS.md`, API 계약은 `apps/api/AGENTS.md`다. 경과가 아니라 지금 유효한 결론을 쓴다.
- 디자인 시안·캔버스는 `.claude/skills/design-canvas/SKILL.md` 순서로 만든다.

# 검증

- 빌드: `pnpm build`
- 테스트: `pnpm --filter @pkpkdupr/api --filter @pkpkdupr/shared --filter @pkpkdupr/web test`
- `pnpm lint`는 현재 eslint 의존성이 설치되어 있지 않아 실패한다. 검증 명령으로 쓰지 않는다.
