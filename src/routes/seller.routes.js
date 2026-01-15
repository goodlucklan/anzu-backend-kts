import { Router } from "express";
import db from "../../database/pg.sql.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

// Configuración
const JWT_SECRET =
  process.env.JWT_SECRET || "tu_clave_secreta_cambiar_en_produccion";
const JWT_EXPIRES_IN = "24h";
const SALT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos en milisegundos

// ========== MIDDLEWARE DE AUTENTICACIÓN ==========
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

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

// ========== 1. REGISTRO ==========
router.post("/vendedores/registro", async (req, res) => {
  try {
    const {
      nombres,
      apellidos,
      correo,
      password,
      dni,
      konami_id,
      whatsapp,
      instagram,
      facebook,
      otro,
    } = req.body;

    // Validaciones básicas
    if (!nombres || !apellidos || !correo || !password || !dni) {
      return res.status(400).json({
        error: "Campos requeridos: nombres, apellidos, correo, password, dni",
      });
    }

    // Validar contraseña
    if (password.length < 8) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 8 caracteres",
      });
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await db.query(
      `
      INSERT INTO vendedores (
        nombres, apellidos, correo, password_hash, dni, konami_id,
        whatsapp, instagram, facebook, otro
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING vendedor_id, nombres, apellidos, correo, dni, konami_id, 
                whatsapp, instagram, facebook, otro, created_at, activo
      `,
      [
        nombres,
        apellidos,
        correo.toLowerCase(),
        passwordHash,
        dni,
        konami_id || null,
        whatsapp || null,
        instagram || null,
        facebook || null,
        otro || null,
      ]
    );

    const vendedor = result.rows[0];

    // Generar token JWT
    const token = jwt.sign(
      {
        vendedor_id: vendedor.vendedor_id,
        correo: vendedor.correo,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      message: "Vendedor registrado exitosamente",
      vendedor,
      token,
    });
  } catch (error) {
    console.error("❌ Error al registrar vendedor:", error);

    if (error.code === "23505") {
      if (error.constraint === "vendedores_correo_key") {
        return res.status(409).json({
          error: "El correo ya está registrado",
        });
      }
      if (error.constraint === "vendedores_dni_key") {
        return res.status(409).json({
          error: "El DNI ya está registrado",
        });
      }
      if (error.constraint === "vendedores_konami_id_key") {
        return res.status(409).json({
          error: "El Konami ID ya está registrado",
        });
      }
    }

    res.status(500).json({
      error: "Error al registrar vendedor",
      message: error.message,
    });
  }
});

// ========== 2. LOGIN ==========
router.post("/vendedores/login", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({
        error: "Correo y contraseña son requeridos",
      });
    }

    // Buscar vendedor
    const result = await db.query(
      `SELECT * FROM vendedores WHERE correo = $1`,
      [correo.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    const vendedor = result.rows[0];

    // Verificar si la cuenta está bloqueada
    if (
      vendedor.bloqueado_hasta &&
      new Date(vendedor.bloqueado_hasta) > new Date()
    ) {
      const minutosRestantes = Math.ceil(
        (new Date(vendedor.bloqueado_hasta) - new Date()) / 60000
      );
      return res.status(423).json({
        error: `Cuenta bloqueada. Intenta de nuevo en ${minutosRestantes} minutos`,
      });
    }

    // Verificar si está activo
    if (!vendedor.activo) {
      return res.status(403).json({
        error: "Cuenta desactivada. Contacta al administrador",
      });
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(
      password,
      vendedor.password_hash
    );

    if (!passwordMatch) {
      // Incrementar intentos fallidos
      const nuevosIntentos = vendedor.intentos_fallidos + 1;
      let bloqueadoHasta = null;

      if (nuevosIntentos >= MAX_LOGIN_ATTEMPTS) {
        bloqueadoHasta = new Date(Date.now() + LOCK_TIME);
        await db.query(
          `UPDATE vendedores 
           SET intentos_fallidos = $1, bloqueado_hasta = $2 
           WHERE vendedor_id = $3`,
          [nuevosIntentos, bloqueadoHasta, vendedor.vendedor_id]
        );

        return res.status(423).json({
          error: `Cuenta bloqueada por múltiples intentos fallidos. Intenta de nuevo en 15 minutos`,
        });
      }

      await db.query(
        `UPDATE vendedores 
         SET intentos_fallidos = $1 
         WHERE vendedor_id = $2`,
        [nuevosIntentos, vendedor.vendedor_id]
      );

      return res.status(401).json({
        error: "Credenciales inválidas",
        intentos_restantes: MAX_LOGIN_ATTEMPTS - nuevosIntentos,
      });
    }

    // Login exitoso - resetear intentos y actualizar último login
    await db.query(
      `UPDATE vendedores 
       SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = CURRENT_TIMESTAMP 
       WHERE vendedor_id = $1`,
      [vendedor.vendedor_id]
    );

    // Generar token JWT
    const token = jwt.sign(
      {
        vendedor_id: vendedor.vendedor_id,
        correo: vendedor.correo,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // No enviar el password_hash al cliente
    delete vendedor.password_hash;
    delete vendedor.intentos_fallidos;
    delete vendedor.bloqueado_hasta;

    res.json({
      message: "Login exitoso",
      vendedor,
      token,
    });
  } catch (error) {
    console.error("❌ Error en login:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

// ========== 3. OBTENER PERFIL (Requiere autenticación) ==========
router.get("/vendedores/perfil", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT vendedor_id, nombres, apellidos, correo, dni, konami_id,
              whatsapp, instagram, facebook, otro, ultimo_login, 
              created_at, updated_at, activo, email_verificado
       FROM vendedores 
       WHERE vendedor_id = $1`,
      [req.user.vendedor_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Vendedor no encontrado",
      });
    }

    res.json({
      vendedor: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al obtener perfil:", error);
    res.status(500).json({
      error: "Error al obtener perfil",
      message: error.message,
    });
  }
});

// ========== 4. ACTUALIZAR PERFIL (Requiere autenticación) ==========
router.put("/vendedores/perfil", authenticateToken, async (req, res) => {
  try {
    const {
      nombres,
      apellidos,
      konami_id,
      whatsapp,
      instagram,
      facebook,
      otro,
    } = req.body;

    const result = await db.query(
      `UPDATE vendedores SET
        nombres = COALESCE($1, nombres),
        apellidos = COALESCE($2, apellidos),
        konami_id = COALESCE($3, konami_id),
        whatsapp = COALESCE($4, whatsapp),
        instagram = COALESCE($5, instagram),
        facebook = COALESCE($6, facebook),
        otro = COALESCE($7, otro)
      WHERE vendedor_id = $8
      RETURNING vendedor_id, nombres, apellidos, correo, dni, konami_id,
                whatsapp, instagram, facebook, otro, created_at, activo`,
      [
        nombres,
        apellidos,
        konami_id,
        whatsapp,
        instagram,
        facebook,
        otro,
        req.user.vendedor_id,
      ]
    );

    res.json({
      message: "Perfil actualizado exitosamente",
      vendedor: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al actualizar perfil:", error);
    res.status(500).json({
      error: "Error al actualizar perfil",
      message: error.message,
    });
  }
});

// ========== 5. CAMBIAR CONTRASEÑA (Requiere autenticación) ==========
router.put(
  "/vendedores/cambiar-password",
  authenticateToken,
  async (req, res) => {
    try {
      const { password_actual, password_nuevo } = req.body;

      if (!password_actual || !password_nuevo) {
        return res.status(400).json({
          error: "Se requiere la contraseña actual y la nueva",
        });
      }

      if (password_nuevo.length < 8) {
        return res.status(400).json({
          error: "La nueva contraseña debe tener al menos 8 caracteres",
        });
      }

      // Obtener contraseña actual
      const result = await db.query(
        "SELECT password_hash FROM vendedores WHERE vendedor_id = $1",
        [req.user.vendedor_id]
      );

      const vendedor = result.rows[0];

      // Verificar contraseña actual
      const passwordMatch = await bcrypt.compare(
        password_actual,
        vendedor.password_hash
      );

      if (!passwordMatch) {
        return res.status(401).json({
          error: "Contraseña actual incorrecta",
        });
      }

      // Hash de la nueva contraseña
      const nuevoPasswordHash = await bcrypt.hash(password_nuevo, SALT_ROUNDS);

      await db.query(
        "UPDATE vendedores SET password_hash = $1 WHERE vendedor_id = $2",
        [nuevoPasswordHash, req.user.vendedor_id]
      );

      res.json({
        message: "Contraseña actualizada exitosamente",
      });
    } catch (error) {
      console.error("❌ Error al cambiar contraseña:", error);
      res.status(500).json({
        error: "Error al cambiar contraseña",
        message: error.message,
      });
    }
  }
);

// ========== 6. LISTAR VENDEDORES (Solo información pública) ==========
router.get("/vendedores", async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT vendedor_id, nombres, apellidos, konami_id,
             whatsapp, instagram, facebook, otro, created_at
      FROM vendedores 
      WHERE activo = true
    `;
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (
        nombres ILIKE $${paramCount} OR 
        apellidos ILIKE $${paramCount} OR 
        konami_id ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${
      paramCount + 1
    }`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    const countResult = await db.query(
      "SELECT COUNT(*) FROM vendedores WHERE activo = true"
    );

    res.json({
      vendedores: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error("❌ Error al obtener vendedores:", error);
    res.status(500).json({
      error: "Error al obtener vendedores",
      message: error.message,
    });
  }
});

// ========== 7. BUSCAR VENDEDOR POR KONAMI ID ==========
router.get("/vendedores/buscar/konami/:konami_id", async (req, res) => {
  try {
    const { konami_id } = req.params;

    const result = await db.query(
      `SELECT vendedor_id, nombres, apellidos, konami_id,
              whatsapp, instagram, facebook, otro
       FROM vendedores 
       WHERE konami_id = $1 AND activo = true`,
      [konami_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Vendedor no encontrado",
      });
    }

    res.json({
      vendedor: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Error al buscar vendedor:", error);
    res.status(500).json({
      error: "Error al buscar vendedor",
      message: error.message,
    });
  }
});

export default router;
