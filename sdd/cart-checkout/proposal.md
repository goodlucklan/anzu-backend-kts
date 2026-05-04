# Proposal: Carrito + Pickup en Tienda

## Intent

Necesitamos un sistema de carrito de compras persistente y un flujo de checkout que genere códigos de retiro (pickup) para una tienda Yu-Gi-Oh! El modelo de entrega es **solo pickup en tienda** — no hay envío a domicilio.

## Scope

### In Scope
- Tablas: `cart`, `cart_items`, `orders`, `order_items`
- CRUD carrito (agregar, modificar cantidad, quitar items)
- Checkout: genera `order` con código de retiro (`pickup_code`)
- Descuento de stock en el checkout
- Vista de pedidos del usuario
- Panel admin: listar pedidos, cambiar estado (pendiente → preparando → listo → entregado)
- Snapshot de precio en `order_items` (el precio no se mueve si el producto cambia después)

### Out of Scope
- Envío a domicilio (no aplica)
- Notificaciones por email/WhatsApp
- Cancelación de pedidos
- Websockets para tiempo real
- Historial de cambios de precio

## Capabilities

### New Capabilities
- `shopping-cart`: Carrito persistente por usuario (tabla `cart`), con operaciones CRUD de items.
- `pickup-checkout`: Checkout que genera orden con código de retiro de 6 caracteres alfanuméricos.
- `order-management`: Vista de pedidos por usuario y panel admin para cambiar estados.

### Modified Capabilities
- Ninguna — no modifica capacidades existentes.

## Approach

### Backend

**Tablas:**

```sql
CREATE TABLE cart (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE cart_items (
  id SERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES cart(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  UNIQUE(cart_id, product_id)
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'preparando', 'listo', 'entregado', 'cancelado')),
  pickup_code CHAR(6) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  card_name TEXT NOT NULL,
  precio_snapshot DECIMAL(10,2) NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);
```

**Rutas:**
```
/api/cart                  GET     → ver carrito del usuario
/api/cart/items            POST    → agregar item
/api/cart/items/:id        PUT     → modificar cantidad
/api/cart/items/:id        DELETE  → quitar item
/api/cart/checkout         POST    → confirmar pedido

/api/orders                GET     → pedidos del usuario autenticado
/api/admin/orders          GET     → todos los pedidos (admin)
/api/admin/orders/:id      PUT     → cambiar status (admin)
```

**Snapshot de precio:** al hacer `checkout`, se guarda `precio_snapshot` del producto en `order_items`, sin vínculo a `store_products`. Esto asegura que si el admin cambia el precio después, el pedido histórico refleja el precio al momento de la compra.

**Stock:** se descuenta al hacer `checkout` (no al confirmar recepción). Si el stock baja a 0, el producto queda `activo=true` pero no aparece en catálogo público (filtro `stock > 0` en `products.routes.js`).

**Generación de `pickup_code`:** 6 caracteres alfanuméricos aleatorios (ej: `A3K9M2`). Se usa `crypto.randomBytes` en Node.

### Frontend (para cuando se implemente)
- `/cart` → vista del carrito con lista de items, total, botón checkout
- `/perfil/pedidos` → historial de pedidos del usuario con estados
- `/admin/pedidos` → tabla admin con filtros y cambio de estado
- Dark mode con Tailwind (`dark:` classes)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/routes/` | New | `cart.routes.js`, `orders.routes.js` |
| `src/routes/admin.routes.js` | Modified | Agregar `/orders` al admin |
| `database/` | Modified | `002_cart_orders.sql` migración |
| `src/index.js` | Modified | Registrar `cartRoutes` y `ordersRoutes` |
| `src/routes/products.routes.js` | Modified | Filtro `stock > 0` ya existente — asegurar |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overselling si dos usuarios compran el mismo stock | Low | Usar transacción atómica con `SELECT FOR UPDATE` o `CHECK (stock >= cantidad)` |
| Código de pickup colisión | Very Low | 6 chars alfanum = ~2B combinaciones, se usa `UNIQUE` constraint |
| Carrito abandonado con stock reservado | Medium | Considerar job que libere stock de pedidos `pendiente` viejos (futuro) |

## Rollback Plan

- `DROP TABLE order_items; DROP TABLE orders; DROP TABLE cart_items; DROP TABLE cart;`
- Remover `cart.routes.js` y `orders.routes.js`
- Desregistrar rutas de `src/index.js`
- Restaurar stock de productos afectados (futuro: con script de rollback)

## Dependencies

- Tabla `store_products` ya existe (de admin-products)
- Auth con JWT funcionando
- Tabla `users` existente

## Success Criteria

- [ ] Un usuario logueado puede agregar productos al carrito, modificar cantidad y quitarlos
- [ ] El checkout genera un `order` con `pickup_code` único y resta stock atómicamente
- [ ] `order_items` guarda `precio_snapshot` al momento del checkout
- [ ] Usuario puede ver sus pedidos con estado actual
- [ ] Admin puede listar todos los pedidos y cambiar su estado
- [ ] Si `stock = 0`, el producto no aparece en `/api/products` (ya filtrado en specs)
- [ ] No hay overselling bajo concurrencia (transacción atómica)
