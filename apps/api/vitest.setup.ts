import type { Server } from "node:http";
import { createRequire } from "node:module";
import { Server as TlsServer } from "node:tls";

/**
 * `getDb()`는 DATABASE_URL이 없으면 생성 시점에 실패한다.
 * 테스트는 저장소를 대체해 실제 연결을 만들지 않으므로, 이 값은 모듈 로딩을 통과시키는 자리표시자다.
 * 셸에 운영 DB 주소가 있어도 테스트가 그쪽을 가리키지 않도록 항상 로컬 주소(`supabase start`의 DB 포트 54322)로 덮어쓴다.
 */
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * supertest는 `listen(0)`으로 모든 주소(`::`)에 바인딩한 뒤 `127.0.0.1:<포트>`로 접속한다.
 * macOS는 다른 프로세스가 같은 포트를 `127.0.0.1`에 따로 바인딩해도 허용하고 그쪽이 연결을 가져가므로,
 * 테스트가 엉뚱한 서버의 응답(예: 404)을 받는 간헐 실패가 난다.
 * 테스트 서버를 `127.0.0.1`에 바인딩하고, 호스트를 주면 listen이 비동기가 되므로 요청 URL은 listening 뒤에 정한다.
 */
type SupertestTest = {
  app: Server;
  url: string;
  _server?: Server;
  _pendingPath?: string;
};
type EndCallback = (err: unknown, res?: unknown) => void;

const require = createRequire(import.meta.url);
const Test = require("supertest/lib/test.js") as {
  prototype: {
    serverAddress(this: SupertestTest, app: Server, path: string): string;
    end(this: SupertestTest, fn?: EndCallback): SupertestTest;
  };
};
const patchedMarker = Symbol.for("pkpkdupr.supertestLoopbackBind");
const testPrototype = Test.prototype as typeof Test.prototype & {
  [patchedMarker]?: true;
};

// supertest는 외부 모듈이라 파일 간에 같은 인스턴스를 공유하므로 한 번만 감싼다
if (!testPrototype[patchedMarker]) {
  testPrototype[patchedMarker] = true;
  const originalEnd = testPrototype.end;

  testPrototype.serverAddress = function (app, path) {
    if (!app.address()) {
      this._server = app.listen(0, "127.0.0.1");
    }
    this._pendingPath = path;
    return path;
  };

  testPrototype.end = function (fn) {
    const server = this.app;
    const start = () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const protocol = server instanceof TlsServer ? "https" : "http";
      this.url = `${protocol}://127.0.0.1:${port}${this._pendingPath ?? ""}`;
      return originalEnd.call(this, fn);
    };
    if (server.listening) {
      return start();
    }
    const onError = (err: unknown) => {
      server.off("listening", onListening);
      fn?.(err);
    };
    const onListening = () => {
      server.off("error", onError);
      start();
    };
    server.once("listening", onListening);
    server.once("error", onError);
    return this;
  };
}
