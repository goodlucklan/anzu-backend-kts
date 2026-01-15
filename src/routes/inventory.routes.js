import { Router } from "express";
import db from "../../database/pg.sql.js";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "tu_clave_secreta_cambiar_en_produccion";

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token inválido o expirado" });
    }
    req.user = user;
    next();
  });
};

// ========== 1. AGREGAR CARTA AL INVENTARIO ==========
router.post("/inventario", authenticateToken, async (req, res) => {
  try {
    const { card_id, cantidad, precio, condicion, idioma, edicion, notas } =
      req.body;

    if (!card_id) {
      return res.status(400).json({
        error: "El card_id es requerido",
      });
    }

    // Verificar que la carta existe
    const cardCheck = await db.query(
      "SELECT id, name FROM cards WHERE id = $1",
      [card_id]
    );

    if (cardCheck.rows.length === 0) {
      return res.status(404).json({
        error: "La carta no existe en la base de datos",
      });
    }

    const result = await db.query(
      `
      INSERT INTO inventario (
        vendedor_id, card_id, cantidad, precio, condicion, idioma, edicion, notas
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (vendedor_id, card_id) 
      DO UPDATE SET
        cantidad = inventario.cantidad + EXCLUDED.cantidad,
        precio = COALESCE(EXCLUDED.precio, inventario.precio),
        condicion = COALESCE(EXCLUDED.condicion, inventario.condicion),
        idioma = COALESCE(EXCLUDED.idioma, inventario.idioma),
        edicion = COALESCE(EXCLUDED.edicion, inventario.edicion),
        notas = COALESCE(EXCLUDED.notas, inventario.notas),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        req.user.vendedor_id,
        card_id,
        cantidad || 1,
        precio || null,
        condicion || "Near Mint",
        idioma || "Inglés",
        edicion || null,
        notas || null,
      ]
    );

    res.status(201).json({
      message: "Carta agregada al inventario exitosamente",
      inventario: result.rows[0],
      carta: cardCheck.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al agregar carta al inventario:", error);
    res.status(500).json({
      error: "Error al agregar carta al inventario",
      message: error.message,
    });
  }
});

// ========== 2. OBTENER MI INVENTARIO (del vendedor autenticado) ==========
router.get("/inventario/mi-inventario", authenticateToken, async (req, res) => {
  try {
    const { condicion, idioma, search, orden = "name" } = req.query;

    let query = `
      SELECT 
        i.inventario_id,
        i.card_id,
        c.name,
        c.type,
        c.race,
        c.attribute,
        c.archetype,
        c.atk,
        c.def,
        c.level,
        i.cantidad,
        i.precio,
        i.condicion,
        i.idioma,
        i.edicion,
        i.notas,
        i.created_at,
        i.updated_at
      FROM inventario i
      INNER JOIN cards c ON i.card_id = c.id
      WHERE i.vendedor_id = $1 AND i.cantidad > 0
    `;

    const params = [req.user.vendedor_id];
    let paramCount = 2;

    // Filtros
    if (condicion) {
      query += ` AND i.condicion = $${paramCount}`;
      params.push(condicion);
      paramCount++;
    }

    if (idioma) {
      query += ` AND i.idioma = $${paramCount}`;
      params.push(idioma);
      paramCount++;
    }

    if (search) {
      query += ` AND c.name ILIKE $${paramCount}`;
      params.push(`%${search}%`);
      paramCount++;
    }

    // Ordenamiento
    const ordenValido = ["name", "cantidad", "precio", "created_at"];
    const ordenFinal = ordenValido.includes(orden) ? orden : "name";

    if (ordenFinal === "name") {
      query += ` ORDER BY c.name ASC`;
    } else if (ordenFinal === "created_at") {
      query += ` ORDER BY i.created_at DESC`;
    } else {
      query += ` ORDER BY i.${ordenFinal} DESC`;
    }

    const result = await db.query(query, params);

    // Estadísticas del inventario
    const statsResult = await db.query(
      `SELECT 
        COUNT(*) as total_cartas_unicas,
        SUM(cantidad) as total_cartas,
        AVG(precio) as precio_promedio,
        MAX(precio) as precio_maximo
      FROM inventario
      WHERE vendedor_id = $1 AND cantidad > 0`,
      [req.user.vendedor_id]
    );

    res.json({
      inventario: result.rows,
      estadisticas: statsResult.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al obtener inventario:", error);
    res.status(500).json({
      error: "Error al obtener inventario",
      message: error.message,
    });
  }
});

// ========== 3. BUSCAR CARTA EN TODOS LOS INVENTARIOS ==========
router.get("/inventario/buscar/:card_id", async (req, res) => {
  try {
    const { card_id } = req.params;
    const { condicion, idioma, precio_max } = req.query;

    let query = `
      SELECT * FROM inventario_detallado
      WHERE card_id = $1
    `;

    const params = [card_id];
    let paramCount = 2;

    if (condicion) {
      query += ` AND condicion = $${paramCount}`;
      params.push(condicion);
      paramCount++;
    }

    if (idioma) {
      query += ` AND idioma = $${paramCount}`;
      params.push(idioma);
      paramCount++;
    }

    if (precio_max) {
      query += ` AND precio <= $${paramCount}`;
      params.push(parseFloat(precio_max));
      paramCount++;
    }

    query += ` ORDER BY precio ASC NULLS LAST`;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        message: "No hay vendedores con esta carta disponible",
        vendedores: [],
      });
    }

    res.json({
      carta_id: card_id,
      carta_nombre: result.rows[0].card_name,
      vendedores: result.rows,
    });
  } catch (error) {
    console.error("❌ Error al buscar carta:", error);
    res.status(500).json({
      error: "Error al buscar carta",
      message: error.message,
    });
  }
});

// ========== 4. BUSCAR POR NOMBRE DE CARTA EN INVENTARIOS ==========
router.get("/inventario/buscar-nombre/:nombre", async (req, res) => {
  try {
    const { nombre } = req.params;
    const { limit = 20 } = req.query;

    const result = await db.query(
      `
      SELECT * FROM inventario_detallado
      WHERE card_name ILIKE $1
      ORDER BY precio ASC NULLS LAST
      LIMIT $2
      `,
      [`%${nombre}%`, parseInt(limit)]
    );

    res.json({
      resultados: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("❌ Error al buscar por nombre:", error);
    res.status(500).json({
      error: "Error al buscar por nombre",
      message: error.message,
    });
  }
});

// ========== 5. VER INVENTARIO DE UN VENDEDOR ESPECÍFICO ==========
router.get("/inventario/vendedor/:vendedor_id", async (req, res) => {
  try {
    const { vendedor_id } = req.params;
    const { search } = req.query;

    let query = `
      SELECT * FROM inventario_detallado
      WHERE vendedor_id = $1
    `;

    const params = [vendedor_id];

    if (search) {
      query += ` AND card_name ILIKE $2`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY card_name ASC`;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.json({
        message: "Este vendedor no tiene cartas en su inventario",
        inventario: [],
      });
    }

    res.json({
      vendedor: {
        id: result.rows[0].vendedor_id,
        nombre: result.rows[0].vendedor_nombre,
        konami_id: result.rows[0].konami_id,
        whatsapp: result.rows[0].whatsapp,
        instagram: result.rows[0].instagram,
      },
      inventario: result.rows,
    });
  } catch (error) {
    console.error("❌ Error al obtener inventario del vendedor:", error);
    res.status(500).json({
      error: "Error al obtener inventario del vendedor",
      message: error.message,
    });
  }
});

// ========== 6. ACTUALIZAR CANTIDAD/PRECIO DE CARTA ==========
router.put(
  "/inventario/:inventario_id",
  authenticateToken,
  async (req, res) => {
    try {
      const { inventario_id } = req.params;
      const { cantidad, precio, condicion, idioma, edicion, notas } = req.body;

      // Verificar que la entrada de inventario pertenece al vendedor
      const checkResult = await db.query(
        "SELECT * FROM inventario WHERE inventario_id = $1 AND vendedor_id = $2",
        [inventario_id, req.user.vendedor_id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          error: "Entrada de inventario no encontrada o no tienes permiso",
        });
      }

      const result = await db.query(
        `
      UPDATE inventario SET
        cantidad = COALESCE($1, cantidad),
        precio = COALESCE($2, precio),
        condicion = COALESCE($3, condicion),
        idioma = COALESCE($4, idioma),
        edicion = COALESCE($5, edicion),
        notas = COALESCE($6, notas)
      WHERE inventario_id = $7
      RETURNING *
      `,
        [cantidad, precio, condicion, idioma, edicion, notas, inventario_id]
      );

      res.json({
        message: "Inventario actualizado exitosamente",
        inventario: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error al actualizar inventario:", error);
      res.status(500).json({
        error: "Error al actualizar inventario",
        message: error.message,
      });
    }
  }
);

// ========== 7. ELIMINAR CARTA DEL INVENTARIO ==========
router.delete(
  "/inventario/:inventario_id",
  authenticateToken,
  async (req, res) => {
    try {
      const { inventario_id } = req.params;

      const result = await db.query(
        "DELETE FROM inventario WHERE inventario_id = $1 AND vendedor_id = $2 RETURNING *",
        [inventario_id, req.user.vendedor_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Entrada de inventario no encontrada o no tienes permiso",
        });
      }

      res.json({
        message: "Carta eliminada del inventario exitosamente",
        inventario: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error al eliminar del inventario:", error);
      res.status(500).json({
        error: "Error al eliminar del inventario",
        message: error.message,
      });
    }
  }
);

// ========== 8. AGREGAR MÚLTIPLES CARTAS AL INVENTARIO ==========
router.post("/inventario/bulk", authenticateToken, async (req, res) => {
  const client = await db.connect();

  try {
    const { cartas } = req.body; // Array de { card_id, cantidad, precio, condicion, idioma, edicion, notas }

    if (!Array.isArray(cartas) || cartas.length === 0) {
      return res.status(400).json({
        error: "Se requiere un array de cartas",
      });
    }

    await client.query("BEGIN");

    const resultados = [];

    for (const carta of cartas) {
      const { card_id, cantidad, precio, condicion, idioma, edicion, notas } =
        carta;

      if (!card_id) continue;

      const result = await client.query(
        `
        INSERT INTO inventario (
          vendedor_id, card_id, cantidad, precio, condicion, idioma, edicion, notas
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (vendedor_id, card_id) 
        DO UPDATE SET
          cantidad = inventario.cantidad + EXCLUDED.cantidad,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `,
        [
          req.user.vendedor_id,
          card_id,
          cantidad || 1,
          precio || null,
          condicion || "Near Mint",
          idioma || "Inglés",
          edicion || null,
          notas || null,
        ]
      );

      resultados.push(result.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: `${resultados.length} cartas agregadas al inventario exitosamente`,
      inventario: resultados,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error al agregar cartas masivamente:", error);
    res.status(500).json({
      error: "Error al agregar cartas masivamente",
      message: error.message,
    });
  } finally {
    client.release();
  }
});

export default router;
