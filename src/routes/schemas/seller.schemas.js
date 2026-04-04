import { z } from "zod";

export const sellerRegisterSchema = z.object({
  nombres: z
    .string({ required_error: "Los nombres son requeridos" })
    .min(2, "Los nombres deben tener al menos 2 caracteres")
    .max(100),

  apellidos: z
    .string({ required_error: "Los apellidos son requeridos" })
    .min(2, "Los apellidos deben tener al menos 2 caracteres")
    .max(100),

  correo: z
    .string({ required_error: "El correo es requerido" })
    .email("Formato de correo inválido")
    .toLowerCase(),

  password: z
    .string({ required_error: "La contraseña es requerida" })
    .min(8, "La contraseña debe tener al menos 8 caracteres"),

  dni: z
    .string({ required_error: "El DNI es requerido" })
    .min(7, "El DNI debe tener al menos 7 caracteres")
    .max(20),

  konami_id: z.string().max(50).optional().nullable(),
  whatsapp:  z.string().max(20).optional().nullable(),
  instagram: z.string().max(100).optional().nullable(),
  facebook:  z.string().max(100).optional().nullable(),
  otro:      z.string().max(200).optional().nullable(),
});

export const sellerLoginSchema = z.object({
  correo: z
    .string({ required_error: "El correo es requerido" })
    .email("Formato de correo inválido")
    .toLowerCase(),

  password: z
    .string({ required_error: "La contraseña es requerida" })
    .min(1, "La contraseña es requerida"),
});

export const sellerUpdateSchema = z.object({
  nombres:   z.string().min(2).max(100).optional(),
  apellidos: z.string().min(2).max(100).optional(),
  konami_id: z.string().max(50).optional().nullable(),
  whatsapp:  z.string().max(20).optional().nullable(),
  instagram: z.string().max(100).optional().nullable(),
  facebook:  z.string().max(100).optional().nullable(),
  otro:      z.string().max(200).optional().nullable(),
});

export const sellerChangePasswordSchema = z.object({
  password_actual: z
    .string({ required_error: "La contraseña actual es requerida" })
    .min(1, "La contraseña actual es requerida"),

  password_nuevo: z
    .string({ required_error: "La nueva contraseña es requerida" })
    .min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});
