import { Router } from "express";
import bcrypt from "bcrypt";
import db from "../../database/pg.sql.js";
import jwt from "jsonwebtoken";
const router = Router();

/** Users */
router.get("/users/:name", async (req, res) => {
  const { name } = req.params;
  const result = await db.query("SELECT * FROM users WHERE name ILIKE $1", [
    `%${name}%`,
  ]);
  res.send(result.rows);
});

router.post("/add", async (req, res) => {
  try {
    const { name, konamiid, email, password } = req.body;
    if (!name || !konamiid || !email || !password) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res
        .status(400)
        .json({ message: "Formato de correo electrónico inválido" });
    }
    const emailCheck = await db.query(
      `SELECT id FROM "users" WHERE email = $1`,
      [email]
    );
    if (emailCheck.rowCount > 0) {
      return res
        .status(400)
        .json({ message: "El correo electrónico ya está registrado" });
    }

    const konamiIdCheck = await db.query(
      `SELECT id FROM "users" WHERE konamiid = $1`,
      [konamiid]
    );
    if (konamiIdCheck.rowCount > 0) {
      return res
        .status(400)
        .json({ message: "El Konami ID ya está registrado" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO "users"(name, konamiid, email, password, create_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, konamiid, email, hashedPassword]
    );
    if (result.rowCount === 1) {
      return res.status(201).json({
        message: "Usuario registrado satisfactoriamente",
        user: result.rows[0],
      });
    } else {
      return res.status(500).json({ message: "Error al registrar el usuario" });
    }
  } catch (error) {
    res.status(500).send("Error en el servidor", error);
  }
});

router.post("/auth", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(`SELECT * FROM "users" WHERE email = $1`, [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Usuario no está activo" });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    // Generar un JWT
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        konamiid: user.konamiid,
      },
      process.env.JWT_SECRET || "jwt_secret",
      { expiresIn: "1d" }
    );

    res.json({ message: "Login exitoso", token });
  } catch (error) {
    console.error("Error en la autenticación:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error al cerrar sesión");
    }
    res.json({ message: "Sesión cerrada correctamente" });
  });
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "jwt_secret");
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export default router;
