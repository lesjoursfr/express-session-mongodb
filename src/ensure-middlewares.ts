import type { NextFunction, Request, Response } from "express";
import { SessionData } from "express-session";

type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export interface EnsureLoggedInMiddlewareOptions {
  redirectTo?: string;
  setReturnTo?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAuthenticated(req: Request & { user?: any } & { isAuthenticated?: () => boolean }): boolean {
  // Check if we have the isAuthenticated method (Passport.js)
  if (typeof req.isAuthenticated === "function") {
    return req.isAuthenticated();
  }

  // Fallback to checking if req.user is set
  return req.user ? true : false;
}

/**
 * Middleware to ensure the user is logged in.
 *
 * Options:
 *  - redirectTo: The URL to redirect to if the user is not logged in (default to /login).
 *  - setReturnTo: Whether to set the returnTo URL in the session (default to true).
 *
 * If the options parameter is a string, it is treated as the redirectTo URL.
 *
 * @param options - Options for the middleware (optional).
 * @returns An Express middleware function.
 */
export function ensureLoggedIn(options?: EnsureLoggedInMiddlewareOptions | string): ExpressMiddleware {
  if (typeof options == "string") {
    options = { redirectTo: options };
  }
  options = options || {};

  const url = options.redirectTo || "/login";
  const setReturnTo = options.setReturnTo === undefined ? true : options.setReturnTo;

  return function (req: Request, res: Response, next: NextFunction) {
    if (!isAuthenticated(req)) {
      if (setReturnTo && req.session) {
        (req.session as SessionData & { returnTo?: string }).returnTo = req.originalUrl || req.url;
      }
      return res.redirect(url);
    }
    next();
  };
}

export interface EnsureLoggedOutMiddlewareOptions {
  redirectTo?: string;
}

/**
 * Middleware to ensure the user is logged out.
 *
 * Options:
 *  - redirectTo: The URL to redirect to if the user is logged in (default to /).
 *
 * If the options parameter is a string, it is treated as the redirectTo URL.
 *
 * @param options - Options for the middleware (optional).
 * @returns An Express middleware function.
 */
export function ensureLoggedOut(options?: EnsureLoggedOutMiddlewareOptions | string): ExpressMiddleware {
  if (typeof options == "string") {
    options = { redirectTo: options };
  }
  options = options || {};

  const url = options.redirectTo || "/";

  return function (req: Request, res: Response, next: NextFunction) {
    if (isAuthenticated(req)) {
      return res.redirect(url);
    }
    next();
  };
}
