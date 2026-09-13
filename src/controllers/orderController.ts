import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/errorHandler";

const orderInclude = {
  user: { select: { id: true, name: true, email: true } },
  items: { include: { variant: { include: { product: true } } } },
} satisfies Prisma.OrderInclude;

// El checkout sin cuenta ("invitado") no crea un User real: todos los pedidos
// de invitado quedan asociados a este único usuario placeholder, y se
// distinguen por guestName/guestEmail (ver attachOrderShipping más abajo).
// Esto evita tener que volver `Order.userId` opcional, algo que el cliente de
// Prisma generado en este entorno no soportaría de forma segura.
const GUEST_USER_EMAIL = "guest-checkout@tienda-ropa.local";

const createOrderSchema = z.object({
  address: z.string().min(5),
  city: z.string().min(2),
  phone: z.string().min(7).max(20),
  notes: z.string().max(500).optional(),
  guestName: z.string().min(1).max(120).optional(),
  guestEmail: z.string().email().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"]),
});

// NOTA: el cliente de Prisma generado en este entorno no conoce las columnas
// de envío de Order (no se pudo correr `prisma generate` aquí), así que se
// completan con SQL crudo. Mismo patrón que productController.ts.
type ShippingRow = {
  id: string;
  address: string;
  city: string;
  phone: string;
  notes: string | null;
  guestName: string | null;
  guestEmail: string | null;
};

async function attachOrderShipping<T extends { id: string }>(
  orderOrOrders: T | T[]
): Promise<void> {
  const orders = Array.isArray(orderOrOrders) ? orderOrOrders : [orderOrOrders];
  const ids = orders.map((o) => o.id);
  if (ids.length === 0) return;

  const rows = await prisma.$queryRaw<ShippingRow[]>`
    SELECT id, address, city, phone, notes, "guestName", "guestEmail"
    FROM "Order" WHERE id = ANY(${ids})
  `;
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const order of orders as Array<
    T & {
      address?: string;
      city?: string;
      phone?: string;
      notes?: string | null;
      guestName?: string | null;
      guestEmail?: string | null;
    }
  >) {
    const row = byId.get(order.id);
    order.address = row?.address ?? "";
    order.city = row?.city ?? "";
    order.phone = row?.phone ?? "";
    order.notes = row?.notes ?? null;
    order.guestName = row?.guestName ?? null;
    order.guestEmail = row?.guestEmail ?? null;
  }
}

export async function listOrders(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orders = await prisma.order.findMany({
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    await attachOrderShipping(orders);
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.auth!.sub },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    await attachOrderShipping(orders);
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

export async function getOrder(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const order = await prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    await attachOrderShipping(order);

    const isGuestOrder = !!(order as { guestName?: string | null }).guestName;
    const isOwner = !!req.auth && order.userId === req.auth.sub;
    const isAdmin = req.auth?.role === "ADMIN";

    // Los pedidos de invitado se pueden consultar con solo conocer el id
    // (UUID, no adivinable) — es como se muestra la confirmación tras el
    // checkout sin cuenta. Los pedidos de un usuario real siguen protegidos.
    if (!isGuestOrder && !isOwner && !isAdmin) {
      throw new AppError("Forbidden", 403);
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
}

export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createOrderSchema.parse(req.body);

    let userId: string;
    let guestName: string | null = null;
    let guestEmail: string | null = null;

    if (req.auth) {
      userId = req.auth.sub;
    } else {
      if (!data.guestName || !data.guestEmail) {
        throw new AppError(
          "guestName and guestEmail are required to check out without an account",
          400
        );
      }
      const guestUser = await prisma.user.findUnique({
        where: { email: GUEST_USER_EMAIL },
      });
      if (!guestUser) {
        throw new AppError("Guest checkout is not available right now", 500);
      }
      userId = guestUser.id;
      guestName = data.guestName;
      guestEmail = data.guestEmail;
    }

    const order = await prisma.$transaction(
      async (tx) => {
        let total = new Prisma.Decimal(0);
        const itemsData: {
          variantId: string;
          quantity: number;
          price: Prisma.Decimal;
        }[] = [];

        for (const item of data.items) {
          const variant = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            include: { product: true },
          });
          if (!variant) {
            throw new AppError(`Variant ${item.variantId} not found`, 404);
          }

          const decremented = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (decremented.count === 0) {
            throw new AppError(
              `Insufficient stock for ${variant.product.name} (${variant.size}/${variant.color})`,
              409
            );
          }

          const price = variant.product.price;
          total = total.plus(price.times(item.quantity));
          itemsData.push({
            variantId: item.variantId,
            quantity: item.quantity,
            price,
          });
        }

        const created = await tx.order.create({
          data: {
            address: data.address,
            city: data.city,
            phone: data.phone,
            userId,
            total,
            items: { create: itemsData },
          },
          include: orderInclude,
        });

        await tx.$executeRaw`
          UPDATE "Order"
          SET address = ${data.address}, city = ${data.city}, phone = ${data.phone}, notes = ${data.notes ?? null},
              "guestName" = ${guestName}, "guestEmail" = ${guestEmail}
          WHERE id = ${created.id}
        `;

        return created;
      },
      { timeout: 15000 }
    );

    await attachOrderShipping(order);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

export async function updateOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const { status } = updateOrderStatusSchema.parse(req.body);

    const order = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.order.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!existing) {
          throw new AppError("Order not found", 404);
        }

        if (status === "CANCELLED" && existing.status !== "CANCELLED") {
          for (const item of existing.items) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            });
          }
        }

        return tx.order.update({
          where: { id },
          data: { status },
          include: orderInclude,
        });
      },
      { timeout: 15000 }
    );

    await attachOrderShipping(order);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// Cancelación por parte del cliente/invitado (no admin): solo mientras el
// pedido está PENDING. Usa la misma regla de propiedad que getOrder — un
// pedido de invitado se puede cancelar con solo conocer el id.
export async function cancelOrder(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);

    const order = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.order.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!existing) {
          throw new AppError("Order not found", 404);
        }

        await attachOrderShipping(existing);
        const isGuestOrder = !!(existing as { guestName?: string | null })
          .guestName;
        const isOwner = !!req.auth && existing.userId === req.auth.sub;
        const isAdmin = req.auth?.role === "ADMIN";

        if (!isGuestOrder && !isOwner && !isAdmin) {
          throw new AppError("Forbidden", 403);
        }

        if (existing.status !== "PENDING") {
          throw new AppError("Only pending orders can be cancelled", 409);
        }

        for (const item of existing.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }

        return tx.order.update({
          where: { id },
          data: { status: "CANCELLED" },
          include: orderInclude,
        });
      },
      { timeout: 15000 }
    );

    await attachOrderShipping(order);
    res.json(order);
  } catch (err) {
    next(err);
  }
}
