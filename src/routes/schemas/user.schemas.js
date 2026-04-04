import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string({ required_error: "El username es requerido" })
    .min(3, "El username debe tener al menos 3 caracteres")
    .max(50, "El username no puede superar 50 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "El username solo puede contener letras, números y guiones bajos"),

  password: z
    .string({ required_error: "La contraseña es requerida" })
    .min(6, "La contraseña debe tener al menos 6 caracteres"),

  email: z
    .string({ required_error: "El email es requerido" })
    .email("Formato de email inválido")
    .toLowerCase(),

  dni: z
    .string({ required_error: "El DNI es requerido" })
    .min(7, "El DNI debe tener al menos 7 caracteres")
    .max(20, "El DNI no puede superar 20 caracteres"),

  user_type: z
    .enum(["cliente", "vendedor"], {
      errorMap: () => ({ message: 'El tipo de usuario debe ser "cliente" o "vendedor"' }),
    })
    .optional()
    .default("cliente"),
});

export const loginSchema = z.object({
  username: z
    .string({ required_error: "El usuario o email es requerido" })
    .min(1, "El usuario o email es requerido"),

  password: z
    .string({ required_error: "La contraseña es requerida" })
    .min(1, "La contraseña es requerida"),
});
