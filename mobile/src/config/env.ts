type AppEnvironment = "development" | "testing" | "production";

function required(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is not configured.`);
  return normalized;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function validateHttpUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  return withoutTrailingSlash(url.toString());
}

const appEnvironment = (process.env.EXPO_PUBLIC_APP_ENV ??
  "development") as AppEnvironment;
const supabaseUrl = validateHttpUrl(
  "EXPO_PUBLIC_SUPABASE_URL",
  required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
);
if (!supabaseUrl.startsWith("https://")) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL must use HTTPS.");
}
const apiUrl = validateHttpUrl(
  "EXPO_PUBLIC_API_URL",
  required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
);

if (appEnvironment === "production") {
  const apiHost = new URL(apiUrl).hostname;
  if (
    !apiUrl.startsWith("https://") ||
    ["localhost", "127.0.0.1", "::1"].includes(apiHost)
  ) {
    throw new Error(
      "Production EXPO_PUBLIC_API_URL must be a public HTTPS endpoint.",
    );
  }
}

export const env = Object.freeze({
  appEnvironment,
  supabaseUrl,
  supabasePublishableKey: required(
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  apiUrl,
  authRedirectUrl:
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim() ||
    "leadsphere://reset-password",
});
