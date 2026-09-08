# API — Tienda Ropa Backend

Base URL local: `http://localhost:4000`

Todas las rutas de negocio están bajo el prefijo `/api`. Los cuerpos de request/response son JSON.

## Errores

Los errores tienen este formato:

```json
{ "error": "mensaje descriptivo" }
```

Códigos usados: `400` (validación), `401` (no autenticado / token inválido), `403` (autenticado pero sin permiso), `404` (no encontrado), `409` (conflicto, ej. duplicado o stock insuficiente), `429` (demasiadas peticiones), `500` (error interno).

## Autenticación en rutas protegidas

Las rutas marcadas requieren el header:
```
Authorization: Bearer <token>
```
- **🔒 Auth** = cualquier usuario logueado.
- **🔒 Admin** = requiere `role: "ADMIN"` (`403` si el usuario es `CUSTOMER`).
- **👤 Opcional** = funciona con o sin token. Si se envía un token válido, la petición actúa como ese usuario; si no, actúa como invitado. Un token inválido/expirado en estas rutas **no** rechaza la petición, simplemente se ignora.

El token JWT expira en **7 días** y va firmado con `JWT_SECRET` (variable de entorno, debe ser un valor largo y aleatorio en producción — nunca el placeholder por defecto).

## CORS

Solo se aceptan peticiones desde los orígenes listados en `CORS_ORIGINS` (env var, separados por coma). En desarrollo: `http://localhost:5174` (admin-ui) y `http://localhost:5175` (tienda). Peticiones sin header `Origin` (curl, apps móviles, health checks) siempre se permiten.

## Rate limiting

- `POST /api/auth/login` y `POST /api/auth/register`: **10 peticiones / 15 min** por IP.
- `POST /api/orders`: **20 peticiones / 15 min** por IP.

Al exceder el límite, responde `429` con `{ "error": "..." }` y headers `RateLimit-*`.

---

## Health

### `GET /health`

Chequeo de vida del servidor.

**Respuesta `200`**
```json
{ "status": "ok" }
```

---

## Auth

### `POST /api/auth/register`

**Body**
```json
{ "name": "Mauricio", "email": "mauri@example.com", "password": "supersecret123" }
```
`password` mínimo 8 caracteres. Se guarda hasheado con bcrypt (10 rounds).

**Respuesta `201`**
```json
{
  "user": { "id": "uuid", "name": "Mauricio", "email": "mauri@example.com", "role": "CUSTOMER", "createdAt": "...", "updatedAt": "..." },
  "token": "<jwt>"
}
```
`409` si el email ya está registrado.

### `POST /api/auth/login`

**Body**
```json
{ "email": "mauri@example.com", "password": "supersecret123" }
```

**Respuesta `200`**: igual que register (`user` + `token`). `401` si las credenciales son inválidas (mismo mensaje tanto si el email no existe como si la password es incorrecta, para no filtrar información).

### `GET /api/auth/me` 🔒 Auth

**Respuesta `200`**: el usuario autenticado (sin `password`). `401` si falta el header o el token es inválido/expiró.

### `PATCH /api/auth/password` 🔒 Auth

**Body**
```json
{ "currentPassword": "supersecret123", "newPassword": "otraClaveSegura456" }
```
`newPassword` mínimo 8 caracteres.

**Respuesta `200`**
```json
{ "message": "Password updated" }
```
`401` si `currentPassword` no coincide con la contraseña actual.

---

## Categories

### `GET /api/categories`

Lista todas las categorías, ordenadas por nombre.

**Respuesta `200`**
```json
[{ "id": "uuid", "name": "Camisetas" }]
```

### `GET /api/categories/:id`

Detalle de una categoría, incluyendo sus productos.

**Respuesta `200`**
```json
{ "id": "uuid", "name": "Camisetas", "products": [ /* Product[] */ ] }
```
`404` si no existe.

### `POST /api/categories` 🔒 Admin

**Body**
```json
{ "name": "Camisetas" }
```

**Respuesta `201`**: la categoría creada. `409` si el nombre ya existe (es `@unique`).

---

## Products

### `GET /api/products`

Lista todos los productos, incluyendo `category` y `variants` (cada variante trae su `imageUrl`), ordenados por fecha de creación descendente.

### `GET /api/products/:id`

Detalle de un producto con `category` y `variants`. `404` si no existe.

### `POST /api/products` 🔒 Admin

**Body**
```json
{
  "name": "Camiseta básica",
  "description": "Camiseta de algodón 100%",
  "price": 19.99,
  "imageUrl": "https://...",
  "categoryId": "uuid"
}
```
`description` e `imageUrl` son opcionales. `categoryId` debe ser una categoría existente.

**Respuesta `201`**: el producto creado.

### `PATCH /api/products/:id` 🔒 Admin

**Body** (todos los campos opcionales, mismas reglas que en la creación)
```json
{ "price": 24.99 }
```
**Respuesta `200`**: el producto actualizado. `404` si no existe.

### `DELETE /api/products/:id` 🔒 Admin

Elimina el producto (y en cascada sus variantes). Responde `204` sin body.
`404` si no existe. `409` si el producto tiene pedidos asociados (no se puede borrar; cancelá o dejá de venderlo en su lugar).

---

## Product Variants (talla / color / stock / imagen)

Anidadas bajo un producto.

### `GET /api/products/:productId/variants`

Lista variantes del producto, ordenadas por talla y color.

### `GET /api/products/:productId/variants/:variantId`

Detalle de una variante. `404` si no existe.

### `POST /api/products/:productId/variants` 🔒 Admin

**Body**
```json
{ "size": "M", "color": "Rojo", "stock": 15, "imageUrl": "https://..." }
```
`stock` es opcional (default `0`). `imageUrl` es opcional — permite mostrar una foto distinta cuando el cliente elige ese color en la tienda. `404` si el producto no existe. `409` si ya existe una variante con esa combinación talla/color para el producto (`@@unique([productId, size, color])`).

### `PATCH /api/products/:productId/variants/:variantId` 🔒 Admin

**Body** (todos los campos opcionales)
```json
{ "stock": 10 }
```
Usalo para ajustar stock, talla, color o `imageUrl` (podés mandar `imageUrl: null` para quitarla). `404` si no existe, `409` si el cambio de talla/color colisiona con otra variante existente.

### `DELETE /api/products/:productId/variants/:variantId` 🔒 Admin

Elimina la variante. Responde `204` sin body. `404` si no existe.

---

## Uploads

### `POST /api/uploads/product-image` 🔒 Admin

Sube una imagen de producto/variante a Supabase Storage y devuelve su URL pública.

**Body**: `multipart/form-data` con un campo `file` (la imagen).

Restricciones: solo `image/*`, máximo 5 MB.

**Respuesta `201`**
```json
{ "url": "https://.../product-images/<uuid>.jpg" }
```
`400` si no se envía archivo, si no es una imagen o si supera el tamaño máximo. `502` si falla la subida a Supabase.

---

## Orders

El checkout admite **cuenta o invitado**: si mandás `Authorization: Bearer <token>`, el pedido queda asociado a ese usuario; si no lo mandás, es obligatorio incluir `guestName` y `guestEmail` en el body.

### `GET /api/orders` 🔒 Admin

Lista **todas** las órdenes de todos los usuarios (incluye invitados), con sus `items` (incluyendo `variant` y `product`) y los datos de envío (`address`, `city`, `phone`, `notes`, `guestName`, `guestEmail`), más recientes primero.

### `GET /api/orders/mine` 🔒 Auth

Lista solo las órdenes del usuario autenticado (mismo formato que arriba). No incluye pedidos de invitado, aunque compartan email.

### `GET /api/orders/:id` 👤 Opcional

Detalle de una orden, con datos de envío incluidos.
- Si es un pedido de invitado (`guestName` presente): visible para cualquiera que tenga el `id` (UUID no adivinable), sin necesidad de token.
- Si es de un usuario registrado: requiere ser el dueño o un admin. `403` en caso contrario.

`404` si el id no existe.

### `POST /api/orders` 👤 Opcional

Crea un pedido y **descuenta stock atómicamente** (transacción: si falta stock de cualquier ítem, no se crea nada). El pedido nace en estado `PENDING` — el pago es contra entrega, no hay cobro online.

**Body**
```json
{
  "address": "Carrera 15 #85-32, Apto 502",
  "city": "Bogotá",
  "phone": "3101234567",
  "notes": "Dejar con el celador si no estoy",
  "guestName": "María Invitada",
  "guestEmail": "maria.invitada@example.com",
  "items": [
    { "variantId": "uuid", "quantity": 2 },
    { "variantId": "uuid", "quantity": 1 }
  ]
}
```
- `address` (mín. 5 caracteres), `city` (mín. 2), `phone` (7–20 caracteres) son obligatorios.
- `notes` es opcional (máx. 500 caracteres).
- `guestName`/`guestEmail` son **obligatorios solo si no mandás token** de autenticación (`400` si faltan). Si mandás token, se ignoran y el pedido queda asociado al usuario logueado.
- `items`: al menos 1 ítem.

**Respuesta `201`**: la orden creada con `status: "PENDING"`, `total` calculado a partir del precio del producto de cada variante, e `items` con el precio congelado al momento de la compra.

Errores: `404` si algún `variantId` no existe; `409` si no hay stock suficiente para algún ítem (mensaje indica cuál); `429` si se excede el rate limit de creación de pedidos.

### `PATCH /api/orders/:id/cancel` 👤 Opcional

Cancela un pedido propio (cuenta o invitado) y **repone el stock** de todos sus ítems. Mismas reglas de propiedad que `GET /api/orders/:id` (invitado con el id alcanza; usuario registrado necesita ser el dueño; admin puede cualquiera).

**Respuesta `200`**: la orden actualizada con `status: "CANCELLED"`.

Errores: `404` si no existe; `403` si no sos el dueño ni admin; `409` si el pedido no está en `PENDING` (solo se puede cancelar mientras está pendiente).

### `PATCH /api/orders/:id/status` 🔒 Admin

**Body**
```json
{ "status": "PAID" }
```
Valores válidos: `PENDING`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`.

Si el nuevo `status` es `CANCELLED` (y la orden no estaba ya cancelada), **repone el stock** de todas las variantes de la orden.

**Respuesta `200`**: la orden actualizada. `404` si no existe.
