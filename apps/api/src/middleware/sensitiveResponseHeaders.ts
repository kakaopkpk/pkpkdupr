import type { NextFunction, Request, Response } from "express";

/** 평문 초대 코드를 요청·응답 본문에 싣는 경로. */
const sensitiveRequestPaths = new Set([
  "/api/auth/invite",
  "/api/admin/invite-codes",
]);

const normalizePath = (path: string) => path.replace(/\/+$/, "") || "/";

export const isSensitiveRequest = (req: Pick<Request, "method" | "path">) =>
  req.method === "POST" && sensitiveRequestPaths.has(normalizePath(req.path));

/** 초대 코드를 다루는 응답은 브라우저와 중간 프록시에 저장하지 않는다. */
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
