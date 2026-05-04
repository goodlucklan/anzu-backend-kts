# Proposal: Admin Panel + Productos

## Intent

Necesitamos un panel de administración para una tienda Yu-Gi-Oh! enfocada en pickup en tienda. El admin debe poder gestionar usuarios (roles, estados) y productos (cartas con precio de tienda). El carrito con checkout se aborda en otra fase.

## Scope

### In Scope
- Middleware `isAdmin` para proteger rutas administrativas
- Endpoints CRUD de usuarios admin (listar, cambiar rol, cambiar estado)
- Tabla `store_products` vinculada a `cards`
- Endpoints CRUD de productos (admin: crear, editar, eliminar; público: listar, ver)
- Sincronización del `user_type` existente `cliente`/`admin` con la nueva tabla `user_roles`

### Out of Scope
- Carrito y checkout (futura fase)
- Sistema de vendedores separate del sistema de usuarios
- Torneos y inventory Routes (ya existen)

## Capabilities

### New Capabilities
- `admin-user-management`: Endpoints para que un admin liste usuarios, cambie roles y active/desactive cuentas.
- `store-products`: Tabla y endpoints para asociar cartas de la DB con precio y stock de tienda.

### Modified Capabilities
- Ninguna — los endpoints existentes de users/cards/inventory no cambian su comportamiento.

## Approach

### Backend

**Nueva tabla:**
```sql
CREATE TABLE store_products (
  id SERIAL PRIMARY KEY,
  card_id BIGINT REFERENCES cards(id),
  precio DECIMAL(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(card_id)
);
```

**Middleware `isAdmin`:**
- Verifica `req.user.user_type === 'admin'` o que `req.user.roles` incluya `'admin'`.
- Retorna 403 si no pasa.

**Rutas nuevas:**
```
/api/admin/users          GET     → listar usuarios (admin)
/api/admin/users/:id     PUT     → actualizar role o is_active (admin)
/api/admin/products      GET     → listar productos (catálogo, público)
/api/admin/products      POST    → crear producto (admin)
/api/admin/products/:id  PUT     → modificar producto (admin)
/api/admin/products/:id  DELETE  → eliminar producto (admin)
```

### Frontend (para cuando se implemente)
- `/admin/users` → tabla de usuarios con acciones (cambiar rol, togglear is_active)
- `/admin/products` → CRUD de productos
- Dark mode con Tailwind (`dark:` classes)

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/routes/` | New | `admin.routes.js` (users + products admin) |
| `src/routes/middleware/auth.middleware.js` | Modified | Agregar `isAdmin` |
| `database/` | Modified | `pg.sql.js` + migrations para `store_products` |
| `src/index.js` | Modified | Registrar `adminRoutes` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Conflicto con sistema `vendedores` existente | Low | Solo afectar tabla `users`, no tocar `vendedores` |
| Breaking changes en auth existente | Low | Solo agregar middleware, no modificar verify/login |

## Rollback Plan

- Eliminar la tabla `store_products`: `DROP TABLE store_products;`
- Eliminar el archivo `src/routes/admin.routes.js`
- Remover el middleware `isAdmin` de `auth.middleware.js`
- Desregistrar las rutas de `src/index.js`
- Rollback de migración: `DROP TABLE store_products;` + eliminar archivo de migración

## Dependencies

- YgoProDeck cards ya en DB (`/getCards` ejecutado exitosamente)
- Sistema de auth con JWT funcionando (`/api/users/login`, `/api/users/verify`)

## Success Criteria

- [ ] `isAdmin` middleware retorna 403 para usuarios no-admin
- [ ] Admin puede listar todos los usuarios y cambiar su rol/estado
- [ ] `store_products` se crea sin conflicts con tablas existentes
- [ ] Endpoint `/api/admin/products` permite crear producto con `card_id + precio`
- [ ] Endpoint `/api/products` es público y retorna solo productos `activo = true`
- [ ] El typo `/api/invetory` se corrige a `/api/inventory` (opcional, documentar)
