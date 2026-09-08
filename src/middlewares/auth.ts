import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";

export interface AuthPayload {
  sub: string;
  role: "ADMIN" | "CUSTOMER";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Missing or invalid Authorization header", 401));
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error("JWT_SECRET is not set"));
  }

  try {
    req.auth = jwt.verify(token, secret) as AuthPayload;
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401));
  }
}

// Igual que `authenticate`, pero no rechaza la petición si no hay token
// (ni si el token es inválido) — se usa en rutas que admiten checkout
// como invitado. `req.auth` queda definido solo si el token era válido.
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return next(new Error("JWT_SECRET is not set"));
  }

  try {
    req.auth = jwt.verify(token, secret) as AuthPayload;
  } catch {
    // token inválido/expirado en una ruta opcional: seguimos como invitado
  }
  next();
}

export function requireRole(...roles: AuthPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return next(new AppError("Forbidden", 403));
    }
    next();
  };
}
