// esbuild inject 대상. 번들 안의 전역 `process`·`Buffer` 참조를 Deno의 Node 호환 모듈로 연결한다.
export { default as process } from "node:process";
export { Buffer } from "node:buffer";
