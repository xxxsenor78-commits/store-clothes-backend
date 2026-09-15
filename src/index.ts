import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();
const port = process.env.PORT ?? 4000;

// Orígenes permitidos para el admin-ui y la tienda; sin esto, cualquier
// sitio podía llamar a la API libremente.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isDevelopment = process.env.NODE_ENV !== "production";

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Peticiones sin origin (curl, apps móviles, health checks) se permiten.
      if (!origin) {
        return callback(null, true);
      }

      // Si no hay lista configurada, permitimos localhost y dev tools en entorno local.
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (isDevelopment && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", apiRouter);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
