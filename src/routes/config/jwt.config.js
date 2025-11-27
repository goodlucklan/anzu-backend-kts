export const JWT_CONFIG = {
  secret:
    process.env.JWT_SECRET ||
    "tu_clave_secreta_muy_segura_cambiar_en_produccion",
  expiresIn: "7d", // El token expira en 7 días
};
