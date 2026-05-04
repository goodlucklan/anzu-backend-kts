import { Router } from "express";
import db from "../../database/pg.sql.js";
import { authMiddleware } from "./middleware/auth.middleware.js";

const router = Router();

// ========== VER MIS PEDIDOS ==========
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const [ordersResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, status, pickup_code, created_at, updated_at
         FROM orders
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, Number(limit), offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM orders WHERE user_id = $1`,
        [req.user.id]
      ),
    ]);

    // Para cada orden, traer items
    const orders = await Promise.all(
      ordersResult.rows.map(async (order) => {
        const itemsResult = await db.query(
          `SELECT card_name, precio_snapshot, cantidad
           FROM order_items WHERE order_id = $1`,
          [order.id]
        );
        const total = itemsResult.rows
          .reduce(
            (sum, item) =>
              sum + parseFloat(item.precio_snapshot) * item.cantidad,
            0
          )
          .toFixed(2);
        return {
          ...order,
          items: itemsResult.rows,
          total,
        };
      })
    );

    res.json({
      orders,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("❌ Error al obtener pedidos:", error);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// ========== VER DETALLE DE UN PEDIDO ==========
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const orderResult = await db.query(
      `SELECT id, status, pickup_code, created_at, updated_at
       FROM orders
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const order = orderResult.rows[0];

    const itemsResult = await db.query(
      `SELECT card_name, precio_snapshot, cantidad
       FROM order_items WHERE order_id = $1`,
      [order.id]
    );

    const total = itemsResult.rows
      .reduce(
        (sum, item) =>
          sum + parseFloat(item.precio_snapshot) * item.cantidad,
        0
      )
      .toFixed(2);

    res.json({
      order: {
        ...order,
        items: itemsResult.rows,
        total,
      },
    });
  } catch (error) {
    console.error("❌ Error al obtener detalle del pedido:", error);
    res.status(500).json({ error: "Error al obtener detalle del pedido" });
  }
});

export default router;
