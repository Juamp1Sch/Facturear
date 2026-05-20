import { z } from "zod";

export const passwordRulesMessage =
  "Mínimo 8 caracteres, una mayúscula y un carácter especial.";

const passwordField = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .regex(/[A-Z]/, "Debe incluir al menos una mayúscula.")
  .regex(/[^A-Za-z0-9]/, "Debe incluir al menos un carácter especial.");

export const LoginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export const RegisterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres."),
    email: z.string().trim().email("Ingresá un email válido."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirmá tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const VerifyRegistrationSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido."),
  token: z.string().trim().min(1, "Ingresá el código de activación."),
});

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido."),
});

export const ResetPasswordSchema = z
  .object({
    email: z.string().trim().email("Ingresá un email válido."),
    token: z.string().trim().min(1, "Ingresá el código de restablecimiento."),
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirmá tu contraseña."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type VerifyRegistrationInput = z.infer<typeof VerifyRegistrationSchema>;
export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
