import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address.")
    .max(254, "Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password."),
});

export const recoverySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address.")
    .max(254, "Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
});

export const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "Use at least 10 characters for your password."),
    confirmation: z.string(),
  })
  .refine((value) => value.password === value.confirmation, {
    message: "The passwords do not match.",
    path: ["confirmation"],
  });

export function firstValidationError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
