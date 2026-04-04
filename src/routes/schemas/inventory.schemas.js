import { z } from "zod";

const CONDICIONES_VALIDAS = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
const IDIOMAS_VALIDOS     = ["Inglés", "Español", "Japonés", "Francés", "Alemán", "Italiano", "Portugués", "Coreano", "Chino"];

const itemInventarioSchema = z.object({
  card_id: z
    .number({ required_error: "El card_id es requerido", invalid_type_error: "card_id debe ser un número" })
    .int("card_id debe ser un entero")
    .positive("card_id debe ser un número positivo"),

  cantidad: z
    .number()
    .int("La cantidad debe ser un entero")
    .min(1, "La cantidad mínima es 1")
    .max(9999, "La cantidad máxima es 9999")
    .optional()
    .default(1),

  precio: z
    .number()
    .min(0, "El precio no puede ser negativo")
    .max(99999, "El precio máximo es 99999")
    .optional()
    .nullable(),

  condicion: z
    .enum(CONDICIONES_VALIDAS, {
      errorMap: () => ({ message: `La condición debe ser una de: ${CONDICIONES_VALIDAS.join(", ")}` }),
    })
    .optional()
    .default("Near Mint"),

  idioma: z
    .enum(IDIOMAS_VALIDOS, {
      errorMap: () => ({ message: `El idioma debe ser uno de: ${IDIOMAS_VALIDOS.join(", ")}` }),
    })
    .optional()
    .default("Inglés"),

  edicion: z.string().max(100).optional().nullable(),
  notas:   z.string().max(500).optional().nullable(),
});

export const addInventarioSchema = itemInventarioSchema;

export const updateInventarioSchema = z.object({
  cantidad:  z.number().int().min(0).max(9999).optional(),
  precio:    z.number().min(0).max(99999).optional().nullable(),
  condicion: z.enum(CONDICIONES_VALIDAS).optional(),
  idioma:    z.enum(IDIOMAS_VALIDOS).optional(),
  edicion:   z.string().max(100).optional().nullable(),
  notas:     z.string().max(500).optional().nullable(),
});

export const bulkInventarioSchema = z.object({
  cartas: z
    .array(itemInventarioSchema)
    .min(1, "Se requiere al menos una carta")
    .max(500, "No se pueden agregar más de 500 cartas a la vez"),
});
