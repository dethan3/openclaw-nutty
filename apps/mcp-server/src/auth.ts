import { timingSafeEqual } from "node:crypto";

import type { Principal } from "@nutty/core";
import type { RequestHandler } from "express";

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function personalProfileAuth(
  accessToken: string,
  principal: Principal,
): RequestHandler {
  return (request, response, next) => {
    const header = request.header("authorization");
    const suppliedToken = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    if (!safeEqual(suppliedToken, accessToken)) {
      response
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="nutty-personal"')
        .json({ error: "authentication_required" });
      return;
    }
    response.locals.principal = principal;
    next();
  };
}
