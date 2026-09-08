import { Router } from "express";
import multer from "multer";
import { uploadProductImage } from "../controllers/uploadController";
import { authenticate, requireRole } from "../middlewares/auth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

export const uploadRoutes = Router();

uploadRoutes.post(
  "/product-image",
  authenticate,
  requireRole("ADMIN"),
  upload.single("file"),
  uploadProductImage
);
