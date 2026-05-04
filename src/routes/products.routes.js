import { Router } from "express";
import db from "../../database/pg.sql.js";

const router = Router();

// ========== CATÁLOGO PÚBLICO (solo activos) ==========
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 30, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = `
      SELECT sp.id, sp.card_id, sp.precio, sp.stock,
             c.name as card_name, c.type, c.attribute, c.race,
             c.atk, c.def, c.level, c.archetype,
             (SELECT image_url FROM card_images WHERE card_id = c.id LIMIT 1) as image_url
      FROM store_products sp
      INNER JOIN cards c ON sp.card_id = c.id
      WHERE sp.activo = true AND sp.stock > 0
    `;
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND c.name ILIKE $${paramCount}`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY c.name LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(Number(limit), offset);

    const [productsResult, countResult] = await Promise.all([
      db.query(query, params),
      db.query(
        `SELECT COUNT(*) FROM store_products sp
         INNER JOIN cards c ON sp.card_id = c.id
         WHERE sp.activo = true AND sp.stock > 0${search ? ` AND c.name ILIKE $1` : ''}`,
        search ? [`%${search}%`] : []
      ),
    ]);

    res.json({
      products: productsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error("❌ Error al obtener catálogo:", error);
    res.status(500).json({ error: "Error al obtener catálogo" });
  }
});

// ========== VER PRODUCTO INDIVIDUAL ==========
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT sp.id, sp.card_id, sp.precio, sp.stock, sp.activo, sp.created_at,
              c.name as card_name, c.type, c.attribute, c.race,
              c.atk, c.def, c.level, c.archetype, c.description as "desc",
              c.human_readable_card_type as humanReadableCardType,
              c.frame_type as frameType, c.ygoprodeck_url
       FROM store_products sp
       INNER JOIN cards c ON sp.card_id = c.id
       WHERE sp.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const product = result.rows[0];

    // Obtener imágenes y prints del producto
    const [imagesResult, printsResult] = await Promise.all([
      db.query(
        `SELECT image_url, image_url_small, image_url_cropped
         FROM card_images WHERE card_id = $1`,
        [product.card_id]
      ),
      db.query(
        `SELECT set_name, set_code, set_rarity, set_price
         FROM card_printings WHERE card_id = $1
         ORDER BY set_name`,
        [product.card_id]
      ),
    ]);

    res.json({
      product: {
        ...product,
        card_images: imagesResult.rows,
        card_sets: printsResult.rows,
      },
    });
  } catch (error) {
    console.error("❌ Error al obtener producto:", error);
    res.status(500).json({ error: "Error al obtener producto" });
  }
});

export default router;
