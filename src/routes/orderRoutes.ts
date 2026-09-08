import { Router } from "express";
import {
  cancelOrder,
  createOrder,
  getOrder,
  listMyOrders,
  listOrders,
  updateOrderStatus,
} from "../controllers/orderController";
import { authenticate, optionalAuthenticate, requireRole } from "../middlewares/auth";
import { orderCreateLimiter } from "../middlewares/rateLimit";

export const orderRoutes = Router();

orderRoutes.get("/", authenticate, requireRole("ADMIN"), listOrders);
orderRoutes.get("/mine", authenticate, listMyOrders);
// Checkout como invitado: sin cuenta, el pedido igual debe poder crearse y
// consultarse (con el id, que es un UUID no adivinable) justo después de crearlo.
orderRoutes.get("/:id", optionalAuthenticate, getOrder);
orderRoutes.post("/", orderCreateLimiter, optionalAuthenticate, createOrder);
orderRoutes.patch("/:id/cancel", optionalAuthenticate, cancelOrder);
orderRoutes.patch(
  "/:id/status",
  authenticate,
  requireRole("ADMIN"),
  updateOrderStatus
);
