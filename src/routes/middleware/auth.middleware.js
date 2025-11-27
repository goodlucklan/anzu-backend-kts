// middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import { JWT_CONFIG } from "../config/jwt.config";

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "Token no proporcionado",
      });
    }

    const decoded = jwt.verify(token, JWT_CONFIG.secret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Token inválido" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expirado" });
    }
    return res.status(500).json({ error: "Error al verificar token" });
  }
};

export const isVendedor = (req, res, next) => {
  if (!req.user.roles || !req.user.roles.includes("vendedor")) {
    return res.status(403).json({
      error: "Acceso denegado. Se requiere rol de vendedor",
    });
  }
  next();
};
