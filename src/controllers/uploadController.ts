import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { PRODUCT_IMAGES_BUCKET, supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/errorHandler";

export async function uploadProductImage(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }

    const ext = req.file.originalname.split(".").pop() || "jpg";
    const path = `${randomUUID()}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (error) {
      throw new AppError(`Upload failed: ${error.message}`, 502);
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);

    res.status(201).json({ url: publicUrl });
  } catch (err) {
    next(err);
  }
}
