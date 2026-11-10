import http from "http";
import { app } from "./index";
import { normalizeEdgeRequestUrl } from "./runtime";

/**
 * Supabase Edge Function `api`의 서버 진입점. `scripts/build-edge.mjs`가 이 파일을 번들링해
 * supabase/functions/api/dist/에 두고, 함수 진입점(supabase/functions/api/index.ts)이 import한다.
 */

// Edge Runtime은 listen 포트와 무관하게 함수로 들어온 요청을 이 서버로 전달한다.
const EDGE_LISTEN_PORT = 8000;

http
  .createServer((req, res) => {
    req.url = normalizeEdgeRequestUrl(req.url ?? "/");
    app(req, res);
  })
  .listen(EDGE_LISTEN_PORT);
