import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path?.join(".");
    const message = field ? `${field}: ${first.message}` : first?.message ?? "Invalid input";
    return res.status(400).json({ error: message });
  }

  if (err instanceof MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err instanceof Error && err.message === "Only image files are allowed") {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
