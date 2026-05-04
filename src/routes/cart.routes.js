import { Router } from "express";
import db from "../../database/pg.sql.js";
import crypto from "crypto";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { validate } from "./middleware/validate.middleware.js";
import { z } from "zod";

const router = Router();

// ========== SCHEMAS ==========
const addCartItemSchema = z.object({
  product_id: z.number().int().positive({ message: "product_id debe ser un entero positivo" }),
  cantidad: z.number().int().positive({ message: "cantidad debe ser mayor a 0" }).optional().default(1),
});

const updateCartItemSchema = z.object({
  cantidad: z.number().int().positive({ message: "cantidad debe ser mayor a 0" }),
});

// ---------- HELPERS ----------

// Obtener o crear carrito del usuario
async function getOrCreateCart(userId) {
  let cartResult = await db.query(
    `SELECT id FROM cart WHERE user_id = $1`,
    [userId]
  );
  if (cartResult.rows.length === 0) {
    cartResult = await db.query(
      `INSERT INTO cart (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
  }
  return cartResult.rows[0].id;
}

// ========== VER CARRITO ==========
router.get("/", authMiddleware, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req.user.id);

    const result = await db.query(
      `SELECT ci.id, ci.product_id, ci.cantidad, ci.added_at,
              sp.precio, sp.stock, sp.activo,
              c.name as card_name, c.type, c.attribute,
              (SELECT image_url FROM card_images WHERE card_id = c.id LIMIT 1) as image_url
       FROM cart_items ci
       INNER JOIN store_products sp ON ci.product_id = sp.id
       INNER JOIN cards c ON sp.card_id = c.id
       WHERE ci.cart_id = $1
       ORDER BY ci.added_at DESC`,
      [cartId]
    );

    // Calcular total
    const total = result.rows.reduce(
      (sum, item) => sum + parseFloat(item.precio) * item.cantidad,
      0
    );

    res.json({
      cart_id: cartId,
      items: result.rows,
      total: total.toFixed(2),
      item_count: result.rows.length,
    });
  } catch (error) {
    console.error("❌ Error al obtener carrito:", error);
    res.status(500).json({ error: "Error al obtener carrito" });
  }
});

// ========== AGREGAR ITEM AL CARRITO ==========
router.post("/items", authMiddleware, validate(addCartItemSchema), async (req, res) => {
  try {
    const { product_id, cantidad } = req.body;
    const cartId = await getOrCreateCart(req.user.id);

    // Verificar que el producto existe y está activo
    const productCheck = await db.query(
      `SELECT sp.id, sp.stock, sp.activo, sp.precio, c.name
       FROM store_products sp
       INNER JOIN cards c ON sp.card_id = c.id
       WHERE sp.id = $1`,
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    if (!productCheck.rows[0].activo) {
      return res.status(400).json({ error: "Producto no disponible" });
    }

    if (productCheck.rows[0].stock < cantidad) {
      return res.status(400).json({
        error: `Stock insuficiente. Disponible: ${productCheck.rows[0].stock}`,
      });
    }

    // Insertar o incrementar cantidad
    const result = await db.query(
      `INSERT INTO cart_items (cart_id, product_id, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (cart_id, product_id)
       DO UPDATE SET cantidad = cart_items.cantidad + EXCLUDED.cantidad
       RETURNING *`,
      [cartId, product_id, cantidad]
    );

    res.status(201).json({
      message: "Item agregado al carrito",
      item: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al agregar item:", error);
    res.status(500).json({ error: "Error al agregar item al carrito" });
  }
});

// ========== MODIFICAR CANTIDAD ==========
router.put("/items/:id", authMiddleware, validate(updateCartItemSchema), async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad } = req.body;

    // Verificar que el item pertenece al carrito del usuario
    const cartId = await getOrCreateCart(req.user.id);

    const itemCheck = await db.query(
      `SELECT ci.id, ci.product_id, ci.cantidad, sp.stock
       FROM cart_items ci
       INNER JOIN store_products sp ON ci.product_id = sp.id
       WHERE ci.id = $1 AND ci.cart_id = $2`,
      [id, cartId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: "Item no encontrado en tu carrito" });
    }

    if (itemCheck.rows[0].stock < cantidad) {
      return res.status(400).json({
        error: `Stock insuficiente. Disponible: ${itemCheck.rows[0].stock}`,
      });
    }

    const result = await db.query(
      `UPDATE cart_items SET cantidad = $1 WHERE id = $2 RETURNING *`,
      [cantidad, id]
    );

    res.json({ message: "Cantidad actualizada", item: result.rows[0] });
  } catch (error) {
    console.error("❌ Error al actualizar item:", error);
    res.status(500).json({ error: "Error al actualizar item" });
  }
});

// ========== QUITAR ITEM ==========
router.delete("/items/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const cartId = await getOrCreateCart(req.user.id);

    const result = await db.query(
      `DELETE FROM cart_items WHERE id = $1 AND cart_id = $2 RETURNING id`,
      [id, cartId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item no encontrado en tu carrito" });
    }

    res.json({ message: "Item eliminado del carrito" });
  } catch (error) {
    console.error("❌ Error al eliminar item:", error);
    res.status(500).json({ error: "Error al eliminar item" });
  }
});

// ========== VACIAR CARRITO ==========
router.delete("/", authMiddleware, async (req, res) => {
  try {
    const cartId = await getOrCreateCart(req.user.id);

    await db.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

    res.json({ message: "Carrito vaciado" });
  } catch (error) {
    console.error("❌ Error al vaciar carrito:", error);
    res.status(500).json({ error: "Error al vaciar carrito" });
  }
});

// ========== CHECKOUT ==========
router.post("/checkout", authMiddleware, async (req, res) => {
  const client = await db.connect();
  try {
    const userId = req.user.id;
    const cartId = await getOrCreateCart(userId);

    await client.query("BEGIN");

    // Obtener items del carrito con lock
    const cartItems = await client.query(
      `SELECT ci.product_id, ci.cantidad, sp.precio, sp.stock, c.name as card_name
       FROM cart_items ci
       INNER JOIN store_products sp ON ci.product_id = sp.id
       INNER JOIN cards c ON sp.card_id = c.id
       WHERE ci.cart_id = $1
       FOR UPDATE OF sp`,
      [cartId]
    );

    if (cartItems.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El carrito está vacío" });
    }

    // Verificar stock disponible para todos los items
    for (const item of cartItems.rows) {
      if (item.stock < item.cantidad) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Stock insuficiente para "${item.card_name}". Disponible: ${item.stock}`,
        });
      }
    }

    // Generar pickup_code único
    let pickupCode;
    let codeExists = true;
    while (codeExists) {
      pickupCode = crypto.randomBytes(3).toString("hex").toUpperCase();
      const codeCheck = await client.query(
        `SELECT 1 FROM orders WHERE pickup_code = $1`,
        [pickupCode]
      );
      codeExists = codeCheck.rows.length > 0;
    }

    // Crear orden
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, pickup_code, status)
       VALUES ($1, $2, 'pendiente')
       RETURNING id, pickup_code, status, created_at`,
      [userId, pickupCode]
    );
    const order = orderResult.rows[0];

    // Insertar order_items con snapshot de precio y restar stock
    for (const item of cartItems.rows) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, card_name, precio_snapshot, cantidad)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.product_id, item.card_name, item.precio, item.cantidad]
      );

      await client.query(
        `UPDATE store_products
         SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [item.cantidad, item.product_id]
      );
    }

    // Vaciar carrito
    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

    await client.query("COMMIT");

    res.status(201).json({
      message: "Pedido confirmado",
      order: {
        id: order.id,
        pickup_code: order.pickup_code,
        status: order.status,
        created_at: order.created_at,
        items: cartItems.rows.map((item) => ({
          card_name: item.card_name,
          cantidad: item.cantidad,
          precio_snapshot: item.precio,
          subtotal: (parseFloat(item.precio) * item.cantidad).toFixed(2),
        })),
        total: cartItems.rows
          .reduce((sum, item) => sum + parseFloat(item.precio) * item.cantidad, 0)
          .toFixed(2),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error en checkout:", error);
    res.status(500).json({ error: "Error en checkout" });
  } finally {
    client.release();
  }
});

export default router;
