import rateLimit from "express-rate-limit";

// Login/registro: sin esto, la contraseña del admin (u otro usuario) se
// podía fuerza-bruta sin ningún límite.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
});

// Creación de pedidos (incluye checkout de invitado, sin auth): sin esto,
// se podía spamear la API para vaciar stock o saturar la tabla de pedidos.
export const orderCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados pedidos en poco tiempo. Probá de nuevo en unos minutos." },
});
