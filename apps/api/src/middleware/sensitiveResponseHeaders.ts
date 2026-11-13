import type { NextFunction, Request, Response } from "express";

/** 초기·임시 비밀번호를 응답 본문에 싣는 POST 경로. Express 라우팅처럼 대소문자를 구분하지 않는다. */
const sensitiveRequestPathPatterns = [
  /^\/api\/admin\/register$/i,
  /^\/api\/admin\/players\/[^/]+\/password-reset$/i,
  /^\/api\/admin\/players\/[^/]+\/promote$/i,
];

const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/";

export const isSensitiveRequest = (req: Pick<Request, "method" | "path">) =>
  req.method === "POST" &&
  sensitiveRequestPathPatterns.some((pattern) =>
    pattern.test(normalizePath(req.path)),
  );

/** 비밀번호를 담는 응답은 브라우저와 중간 프록시에 저장하지 않는다. */
export const sensitiveResponseHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (isSensitiveRequest(req)) {
    res.set("Cache-Control", "no-store");
  }
  next();
};
