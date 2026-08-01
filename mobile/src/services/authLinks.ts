export interface AuthLinkPayload {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  isRecovery: boolean;
}

function parameters(url: string): URLSearchParams {
  const parsed = new URL(url);
  const combined = new URLSearchParams(parsed.search);
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
  new URLSearchParams(hash).forEach((value, key) => combined.set(key, value));
  return combined;
}

export function parseAuthLink(url: string): AuthLinkPayload {
  const parsed = new URL(url);
  const params = parameters(url);
  const route = `${parsed.host}${parsed.pathname}`.replace(/^\/+|\/+$/g, "");
  return {
    code: params.get("code"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    isRecovery: params.get("type") === "recovery" || route === "reset-password",
  };
}
