import rateLimit from "express-rate-limit";

// ── Limiter general ─────────────────────────────────────────────────────────
// Aplica a todos los endpoints. Permite 200 peticiones cada 15 minutos por IP.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: {
    error: "Demasiadas solicitudes desde esta IP. Intenta de nuevo en 15 minutos.",
  },
  standardHeaders: true,  // Devuelve cabeceras RateLimit-*
  legacyHeaders: false,   // Deshabilita las cabeceras X-RateLimit-*
});

// ── Limiter para login ───────────────────────────────────────────────────────
// Estricto: máximo 10 intentos de login por IP cada 15 minutos.
// Protege contra ataques de fuerza bruta.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: "Demasiados intentos de login. Intenta de nuevo en 15 minutos.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Limiter para registro ────────────────────────────────────────────────────
// Muy restrictivo: máximo 5 registros nuevos por IP por hora.
// Evita la creación masiva de cuentas.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: {
    error: "Demasiados intentos de registro desde esta IP. Intenta de nuevo en 1 hora.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
