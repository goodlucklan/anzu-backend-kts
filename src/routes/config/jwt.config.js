import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET no está definido en las variables de entorno. Revisa tu archivo .env");
}

export const JWT_CONFIG = {
  secret: process.env.JWT_SECRET,
  expiresIn: "7d", // El token expira en 7 días
};
