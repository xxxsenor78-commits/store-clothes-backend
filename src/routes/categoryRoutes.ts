import { Router } from "express";
import {
  createCategory,
  getCategory,
  listCategories,
} from "../controllers/categoryController";
import { authenticate, requireRole } from "../middlewares/auth";

export const categoryRoutes = Router();

categoryRoutes.get("/", listCategories);
categoryRoutes.get("/:id", getCategory);
categoryRoutes.post("/", authenticate, requireRole("ADMIN"), createCategory);
