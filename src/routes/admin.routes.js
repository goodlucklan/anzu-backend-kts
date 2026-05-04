import { Router } from "express";
import db from "../../database/pg.sql.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { isAdmin } from "./middleware/auth.middleware.js";
import { validate } from "./middleware/validate.middleware.js";
import { z } from "zod";

const router = Router();

// ========== SCHEMAS ==========
const updateUserRoleSchema = z.object({
  role: z.enum(["cliente", "vendedor", "admin"], {
    errorMap: () => ({ message: 'El rol debe ser "cliente", "vendedor" o "admin"' }),
  }),
});

const updateUserStatusSchema = z.object({
  is_active: z.boolean({
    errorMap: () => ({ message: "is_active debe ser un booleano" }),
  }),
});

const createProductSchema = z.object({
  card_id: z.number().int().positive({ message: "card_id debe ser un entero positivo" }),
  precio: z.number().positive({ message: "precio debe ser positivo" }),
  stock: z.number().int().min(0).optional().default(0),
});

const updateProductSchema = z.object({
  precio: z.number().positive({ message: "precio debe ser positivo" }).optional(),
  stock: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
});

// ========== LISTAR USUARIOS ==========
router.get("/users", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, rol } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT u.id, u.username, u.email, u.dni, u.user_type, u.is_active, u.created_at, u.updated_at,
             ARRAY_AGG(ur.role) FILTER (WHERE ur.role IS NOT NULL) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (u.username ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (rol) {
      query += ` AND ur.role = $${paramCount}`;
      params.push(rol);
      paramCount++;
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(Number(limit), offset);

    const result = await db.query(query, params);

    const countResult = await db.query(`SELECT COUNT(DISTINCT id) FROM users`);

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("❌ Error al listar usuarios:", error);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

// ========== ACTUALIZAR ROL DE USUARIO ==========
router.put("/users/:id/role", authMiddleware, isAdmin, validate(updateUserRoleSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // No dejar que un admin quite su propio rol
    if (Number(id) === req.user.id && role !== "admin") {
      return res.status(400).json({
        error: "No puedes quitarte tu propio rol de administrador",
      });
    }

    await db.query("BEGIN");

    // Actualizar user_type
    await db.query(
      `UPDATE users SET user_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [role, id]
    );

    // Reemplazar rol en user_roles
    await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
    await db.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`,
      [id, role]
    );

    await db.query("COMMIT");

    res.json({ message: `Rol actualizado a "${role}" exitosamente` });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error al actualizar rol:", error);
    res.status(500).json({ error: "Error al actualizar rol" });
  }
});

// ========== ACTIVAR/DESACTIVAR USUARIO ==========
router.put("/users/:id/status", authMiddleware, isAdmin, validate(updateUserStatusSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    // No autoflag
    if (Number(id) === req.user.id) {
      return res.status(400).json({
        error: "No puedes cambiar tu propio estado",
      });
    }

    const result = await db.query(
      `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, is_active`,
      [is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({
      message: `Usuario ${is_active ? "activado" : "desactivado"} exitosamente`,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al cambiar estado:", error);
    res.status(500).json({ error: "Error al cambiar estado del usuario" });
  }
});

// ============================================================
// PRODUCTOS (admin)
// ============================================================

// ---------- LISTAR TODOS LOS PRODUCTOS (admin) ----------
router.get("/products", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [productsResult, countResult] = await Promise.all([
      db.query(
        `SELECT sp.id, sp.card_id, sp.precio, sp.stock, sp.activo, sp.created_at, sp.updated_at,
                c.name as card_name, c.type, c.attribute, c.race
         FROM store_products sp
         INNER JOIN cards c ON sp.card_id = c.id
         ORDER BY sp.created_at DESC
         LIMIT $1 OFFSET $2`,
        [Number(limit), offset]
      ),
      db.query(`SELECT COUNT(*) FROM store_products`),
    ]);

    res.json({
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("❌ Error al listar productos (admin):", error);
    res.status(500).json({ error: "Error al listar productos" });
  }
});

// ---------- CREAR PRODUCTO ----------
router.post("/products", authMiddleware, isAdmin, validate(createProductSchema), async (req, res) => {
  try {
    const { card_id, precio, stock } = req.body;

    // Verificar que la carta existe en ygoprodeck
    const cardCheck = await db.query(`SELECT id, name FROM cards WHERE id = $1`, [card_id]);
    if (cardCheck.rows.length === 0) {
      return res.status(404).json({ error: "La carta no existe en la base de datos" });
    }

    const result = await db.query(
      `INSERT INTO store_products (card_id, precio, stock)
       VALUES ($1, $2, $3)
       ON CONFLICT (card_id) DO UPDATE SET precio = EXCLUDED.precio, stock = EXCLUDED.stock
       RETURNING *`,
      [card_id, precio, stock || 0]
    );

    res.status(201).json({
      message: "Producto creado exitosamente",
      product: result.rows[0],
      card: cardCheck.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al crear producto:", error);
    res.status(500).json({ error: "Error al crear producto" });
  }
});

// ---------- ACTUALIZAR PRODUCTO ----------
router.put("/products/:id", authMiddleware, isAdmin, validate(updateProductSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { precio, stock, activo } = req.body;

    const result = await db.query(
      `UPDATE store_products
       SET precio = COALESCE($1, precio),
           stock = COALESCE($2, stock),
           activo = COALESCE($3, activo),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [precio, stock, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({ message: "Producto actualizado", product: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al actualizar producto:", error);
    res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// ---------- ELIMINAR PRODUCTO ----------
router.delete("/products/:id", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `DELETE FROM store_products WHERE id = $1 RETURNING id, card_id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json({ message: "Producto eliminado", product: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al eliminar producto:", error);
    res.status(500).json({ error: "Error al eliminar producto" });
  }
});

// ============================================================
// ÓRDENES (admin)
// ============================================================

// ---------- LISTAR TODAS LAS ÓRDENES ----------
router.get("/orders", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 30, status, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT o.id, o.user_id, o.status, o.pickup_code, o.created_at, o.updated_at,
             u.username, u.email
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND o.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (search) {
      query += ` AND (u.username ILIKE $${paramCount} OR o.pickup_code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(Number(limit), offset);

    const [ordersResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(
        `SELECT COUNT(*) FROM orders o
         INNER JOIN users u ON o.user_id = u.id
         WHERE 1=1${status ? ` AND o.status = '${status}'` : ''}`
      ),
    ]);

    res.json({
      orders: ordersResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("❌ Error al listar órdenes:", error);
    res.status(500).json({ error: "Error al listar órdenes" });
  }
});

// ---------- VER DETALLE DE ÓRDEN ----------
router.get("/orders/:id", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await db.query(
      `SELECT o.id, o.user_id, o.status, o.pickup_code, o.created_at, o.updated_at,
              u.username, u.email
       FROM orders o
       INNER JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    const order = orderResult.rows[0];

    const itemsResult = await db.query(
      `SELECT product_id, card_name, precio_snapshot, cantidad
       FROM order_items WHERE order_id = $1`,
      [id]
    );

    const total = itemsResult.rows
      .reduce(
        (sum, item) =>
          sum + parseFloat(item.precio_snapshot) * item.cantidad,
        0
      )
      .toFixed(2);

    res.json({
      order: { ...order, items: itemsResult.rows, total },
    });
  } catch (error) {
    console.error("❌ Error al obtener detalle de orden:", error);
    res.status(500).json({ error: "Error al obtener detalle de orden" });
  }
});

// ---------- CAMBIAR ESTADO DE ÓRDEN ----------
router.put("/orders/:id/status", authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["pendiente", "preparando", "listo", "entregado", "cancelado"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Estado inválido. Debe ser: ${validStatuses.join(", ")}`,
      });
    }

    const result = await db.query(
      `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Orden no encontrada" });
    }

    res.json({ message: `Estado actualizado a "${status}"`, order: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al cambiar estado de orden:", error);
    res.status(500).json({ error: "Error al cambiar estado de orden" });
  }
});

export default router;
