import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/productController";
import { authenticate, requireRole } from "../middlewares/auth";
import { variantRoutes } from "./variantRoutes";

export const productRoutes = Router();

productRoutes.get("/", listProducts);
productRoutes.get("/:id", getProduct);
productRoutes.post("/", authenticate, requireRole("ADMIN"), createProduct);
productRoutes.patch("/:id", authenticate, requireRole("ADMIN"), updateProduct);
productRoutes.delete(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  deleteProduct
);
productRoutes.use("/:productId/variants", variantRoutes);
