import { Router } from "express";
import {
  createVariant,
  deleteVariant,
  getVariant,
  listVariants,
  updateVariant,
} from "../controllers/variantController";
import { authenticate, requireRole } from "../middlewares/auth";

export const variantRoutes = Router({ mergeParams: true });

variantRoutes.get("/", listVariants);
variantRoutes.get("/:variantId", getVariant);
variantRoutes.post("/", authenticate, requireRole("ADMIN"), createVariant);
variantRoutes.patch(
  "/:variantId",
  authenticate,
  requireRole("ADMIN"),
  updateVariant
);
variantRoutes.delete(
  "/:variantId",
  authenticate,
  requireRole("ADMIN"),
  deleteVariant
);
