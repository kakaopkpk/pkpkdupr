// Supabase Edge Function `api` 진입점.
// apps/api의 Express app을 묶은 번들을 불러오며, 번들이 요청을 받는 서버를 띄운다.
// 번들은 `pnpm build:edge`로 만들고 커밋하지 않는다(배포 workflow가 배포 직전에 만든다).
import "./dist/api.js";
