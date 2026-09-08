import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/errorHandler";

const createVariantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().optional(),
});

const updateVariantSchema = z.object({
  size: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  stock: z.number().int().min(0).optional(),
  imageUrl: z.string().url().nullable().optional(),
});

// NOTA: el cliente de Prisma generado en este entorno no conoce la columna
// `imageUrl` (no se pudo correr `prisma generate` aquí), así que se lee/escribe
// con SQL crudo mientras el resto de campos usa el cliente tipado normal.
type VariantRow = {
  id: string;
  productId: string;
  size: string;
  color: string;
  stock: number;
  imageUrl: string | null;
};

async function fetchVariantRow(variantId: string): Promise<VariantRow | null> {
  const rows = await prisma.$queryRaw<VariantRow[]>`
    SELECT * FROM "ProductVariant" WHERE id = ${variantId}
  `;
  return rows[0] ?? null;
}

export async function listVariants(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    const variants = await prisma.$queryRaw<VariantRow[]>`
      SELECT * FROM "ProductVariant"
      WHERE "productId" = ${productId}
      ORDER BY "size" ASC, "color" ASC
    `;
    res.json(variants);
  } catch (err) {
    next(err);
  }
}

export async function getVariant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const variantId = z.string().uuid().parse(req.params.variantId);
    const variant = await fetchVariantRow(variantId);

    if (!variant) {
      throw new AppError("Variant not found", 404);
    }

    res.json(variant);
  } catch (err) {
    next(err);
  }
}

export async function createVariant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    const { imageUrl, ...data } = createVariantSchema.parse(req.body);

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new AppError("Product not found", 404);
    }

    const variant = await prisma.productVariant.create({
      data: { ...data, productId },
    });

    if (imageUrl) {
      await prisma.$executeRaw`
        UPDATE "ProductVariant" SET "imageUrl" = ${imageUrl} WHERE id = ${variant.id}
      `;
    }

    res.status(201).json(await fetchVariantRow(variant.id));
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return next(
        new AppError(
          "A variant with this size/color already exists for this product",
          409
        )
      );
    }
    next(err);
  }
}

export async function updateVariant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const variantId = z.string().uuid().parse(req.params.variantId);
    const { imageUrl, ...data } = updateVariantSchema.parse(req.body);

    if (Object.keys(data).length > 0) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data,
      });
    } else if (!(await fetchVariantRow(variantId))) {
      throw new AppError("Variant not found", 404);
    }

    if (imageUrl !== undefined) {
      await prisma.$executeRaw`
        UPDATE "ProductVariant" SET "imageUrl" = ${imageUrl} WHERE id = ${variantId}
      `;
    }

    res.json(await fetchVariantRow(variantId));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return next(new AppError("Variant not found", 404));
      }
      if (err.code === "P2002") {
        return next(
          new AppError(
            "A variant with this size/color already exists for this product",
            409
          )
        );
      }
    }
    next(err);
  }
}

export async function deleteVariant(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const variantId = z.string().uuid().parse(req.params.variantId);
    await prisma.productVariant.delete({ where: { id: variantId } });
    res.status(204).send();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return next(new AppError("Variant not found", 404));
    }
    next(err);
  }
}
