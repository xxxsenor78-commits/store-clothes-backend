import { Router } from "express";
import { authRoutes } from "./authRoutes";
import { categoryRoutes } from "./categoryRoutes";
import { orderRoutes } from "./orderRoutes";
import { productRoutes } from "./productRoutes";
import { uploadRoutes } from "./uploadRoutes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", productRoutes);
apiRouter.use("/categories", categoryRoutes);
apiRouter.use("/orders", orderRoutes);
apiRouter.use("/uploads", uploadRoutes);
