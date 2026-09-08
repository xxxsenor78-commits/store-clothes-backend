import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/errorHandler";

const createCategorySchema = z.object({
  name: z.string().min(1),
});

export async function listCategories(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
}

export async function getCategory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const category = await prisma.category.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    res.json(category);
  } catch (err) {
    next(err);
  }
}

export async function createCategory(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = createCategorySchema.parse(req.body);
    const category = await prisma.category.create({ data });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
}
