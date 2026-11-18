// esbuild inject 대상. 번들 안의 Node 전역 참조를 Deno의 Node 호환 모듈로 연결한다.
// 번들에 넣은 npm 패키지(postgres)는 Deno가 npm 패키지에만 주는 Node 전역을 받지 못하므로 여기서 채운다.
export { default as process } from "node:process";
export { Buffer } from "node:buffer";
export { setImmediate, clearImmediate } from "node:timers";
