import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/errorHandler";

const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid(),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().uuid().optional(),
});

// NOTA: el cliente de Prisma generado en este entorno no conoce la columna
// `imageUrl` de ProductVariant (no se pudo correr `prisma generate` aquí),
// así que se completa con SQL crudo. Ver variantController.ts para el mismo patrón.
type VariantImageRow = { id: string; imageUrl: string | null };

async function attachVariantImages<
  T extends { variants: { id: string }[] }
>(productOrProducts: T | T[]): Promise<void> {
  const products = Array.isArray(productOrProducts)
    ? productOrProducts
    : [productOrProducts];

  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  if (variantIds.length === 0) return;

  const rows = await prisma.$queryRaw<VariantImageRow[]>`
    SELECT id, "imageUrl" FROM "ProductVariant" WHERE id = ANY(${variantIds})
  `;
  const imageById = new Map(rows.map((r) => [r.id, r.imageUrl]));

  for (const product of products) {
    for (const variant of product.variants as Array<{ id: string; imageUrl?: string | null }>) {
      variant.imageUrl = imageById.get(variant.id) ?? null;
    }
  }
}

export async function listProducts(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const products = await prisma.product.findMany({
      include: { category: true, variants: true },
      orderBy: { createdAt: "desc" },
    });
    await attachVariantImages(products);
    res.json(products);
  } catch (err) {
    next(err);
  }
}

export async function getProduct(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: true },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    await attachVariantImages(product);
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createProductSchema.parse(req.body);
    const product = await prisma.product.create({ data });
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const data = updateProductSchema.parse(req.body);
    const product = await prisma.product.update({ where: { id }, data });
    res.json(product);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return next(new AppError("Product not found", 404));
    }
    next(err);
  }
}

export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await prisma.product.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        return next(new AppError("Product not found", 404));
      }
      if (err.code === "P2003") {
        return next(
          new AppError(
            "Cannot delete: this product has orders associated with it",
            409
          )
        );
      }
    }
    next(err);
  }
}
