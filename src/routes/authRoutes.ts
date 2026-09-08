import { Router } from "express";
import { changePassword, login, me, register } from "../controllers/authController";
import { authenticate } from "../middlewares/auth";
import { authLimiter } from "../middlewares/rateLimit";

export const authRoutes = Router();

authRoutes.post("/register", authLimiter, register);
authRoutes.post("/login", authLimiter, login);
authRoutes.get("/me", authenticate, me);
authRoutes.patch("/password", authenticate, changePassword);
