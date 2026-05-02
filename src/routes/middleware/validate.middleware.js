// middleware/validate.middleware.js
// Middleware genérico para validar el body de la request usando schemas de Zod

/**
 * Recibe un schema de Zod y devuelve un middleware Express que valida req.body.
 * Si la validación falla, responde con 400 y detalle de los errores.
 * Si pasa, req.body queda reemplazado por el valor parseado (con coerción de tipos).
 */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Datos inválidos",
      detalles: result.error.issues.map((e) => ({
        campo: e.path.join(".") || "body",
        mensaje: e.message,
      })),
    });
  }

  // Reemplazar req.body con el valor limpio y coercionado por Zod
  req.body = result.data;
  next();
};
