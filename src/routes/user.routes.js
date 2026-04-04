import { Router } from "express";
import bcrypt from "bcrypt";
import db from "../../database/pg.sql.js";
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "./config/jwt.config.js";
import { authMiddleware } from "./middleware/auth.middleware.js";
import { validate } from "./middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "./schemas/user.schemas.js";

const router = Router();

// ========== REGISTRO DE USUARIO ==========
router.post("/register", validate(registerSchema), async (req, res) => {
  try {
    const { username, password, email, dni, user_type } = req.body;

    console.log(`📝 Intentando registrar usuario: ${username}`);

    await db.query("BEGIN");

    // Verificar si el usuario, email o DNI ya existen
    const existingUser = await db.query(
      `
      SELECT 
        CASE 
          WHEN username = $1 THEN 'username'
          WHEN email = $2 THEN 'email'
          WHEN dni = $3 THEN 'dni'
        END as conflict_field
      FROM users
      WHERE username = $1 OR email = $2 OR dni = $3
      LIMIT 1
      `,
      [username, email, dni]
    );

    if (existingUser.rows.length > 0) {
      await db.query("ROLLBACK");
      return res.status(409).json({
        error: `El ${existingUser.rows[0].conflict_field} ya está registrado`,
      });
    }

    // Encriptar contraseña
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insertar usuario
    const result = await db.query(
      `
      INSERT INTO users (username, password_hash, email, dni, user_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, dni, user_type, created_at
      `,
      [username, password_hash, email, dni, user_type || "cliente"]
    );

    const newUser = result.rows[0];

    // Asignar rol por defecto (cliente)
    await db.query(
      `
      INSERT INTO user_roles (user_id, role)
      VALUES ($1, $2)
      `,
      [newUser.id, user_type || "cliente"]
    );

    await db.query("COMMIT");

    // Generar token JWT
    const token = jwt.sign(
      {
        id: newUser.id,
        username: newUser.username,
        user_type: newUser.user_type,
      },
      JWT_CONFIG.secret,
      { expiresIn: JWT_CONFIG.expiresIn }
    );

    console.log(`✅ Usuario registrado exitosamente: ${username}`);

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        dni: newUser.dni,
        user_type: newUser.user_type,
        created_at: newUser.created_at,
      },
      token,
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error al registrar usuario:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

// ========== LOGIN DE USUARIO ==========
router.post("/login", validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log(`🔐 Intento de login: ${username}`);

    // Buscar usuario (puede usar username o email)
    const result = await db.query(
      `
      SELECT id, username, password_hash, email, dni, user_type, is_active
      FROM users
      WHERE username = $1 OR email = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    const user = result.rows[0];

    // Verificar si el usuario está activo
    if (!user.is_active) {
      return res.status(403).json({
        error: "Usuario desactivado. Contacta al administrador",
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Credenciales inválidas",
      });
    }

    // Obtener roles del usuario
    const rolesResult = await db.query(
      `
      SELECT role FROM user_roles WHERE user_id = $1
      `,
      [user.id]
    );

    const roles = rolesResult.rows.map((row) => row.role);

    // Actualizar última conexión
    await db.query(
      `
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1
      `,
      [user.id]
    );

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        user_type: user.user_type,
        roles,
      },
      JWT_CONFIG.secret,
      { expiresIn: JWT_CONFIG.expiresIn }
    );

    console.log(`✅ Login exitoso: ${username}`);

    res.json({
      message: "Login exitoso",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        dni: user.dni,
        user_type: user.user_type,
        roles,
      },
      token,
    });
  } catch (error) {
    console.error("❌ Error al hacer login:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

// ========== VERIFICAR TOKEN ==========
router.get("/verify", authMiddleware, async (req, res) => {
  try {
    // req.user ya fue verificado por authMiddleware
    const result = await db.query(
      `
      SELECT id, username, email, dni, user_type, is_active
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        error: "Usuario no válido",
      });
    }

    const rolesResult = await db.query(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [req.user.id]
    );

    const roles = rolesResult.rows.map((row) => row.role);

    res.json({
      valid: true,
      user: {
        ...result.rows[0],
        roles,
      },
    });
  } catch (error) {
    console.error("❌ Error al verificar token:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

// ========== CAMBIAR TIPO DE USUARIO ==========
router.post("/upgrade-to-seller", authMiddleware, async (req, res) => {
  try {
    // req.user ya fue verificado por authMiddleware
    await db.query("BEGIN");

    // Verificar que el usuario no sea ya vendedor
    const checkRole = await db.query(
      `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'vendedor'`,
      [req.user.id]
    );

    if (checkRole.rows.length > 0) {
      await db.query("ROLLBACK");
      return res.status(400).json({
        error: "El usuario ya es vendedor",
      });
    }

    // Agregar rol de vendedor
    await db.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'vendedor')`,
      [req.user.id]
    );

    await db.query(
      `UPDATE users SET user_type = 'vendedor', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [req.user.id]
    );

    await db.query("COMMIT");

    console.log(`✅ Usuario ${req.user.username} ahora es vendedor`);

    res.json({
      message: "Usuario actualizado a vendedor exitosamente",
    });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("❌ Error al actualizar usuario:", error);
    res.status(500).json({
      error: "Error en el servidor",
      message: error.message,
    });
  }
});

export default router;
