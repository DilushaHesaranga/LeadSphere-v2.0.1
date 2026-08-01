import { loginSchema, passwordSchema, recoverySchema } from "./auth";

describe("authentication validation", () => {
  it("normalizes valid login email addresses", () => {
    const result = loginSchema.parse({
      email: " Sales@Example.com ",
      password: "not-stored-here",
    });
    expect(result.email).toBe("sales@example.com");
  });

  it("rejects invalid login and recovery addresses", () => {
    expect(loginSchema.safeParse({ email: "bad", password: "" }).success).toBe(
      false,
    );
    expect(recoverySchema.safeParse({ email: "bad" }).success).toBe(false);
  });

  it("requires a strong matching replacement password", () => {
    expect(
      passwordSchema.safeParse({ password: "short", confirmation: "short" })
        .success,
    ).toBe(false);
    expect(
      passwordSchema.safeParse({
        password: "long-password",
        confirmation: "different-password",
      }).success,
    ).toBe(false);
    expect(
      passwordSchema.safeParse({
        password: "long-password",
        confirmation: "long-password",
      }).success,
    ).toBe(true);
  });
});
