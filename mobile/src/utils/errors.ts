export function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "The email address or password is incorrect.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }
  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "LeadSphere could not connect. Check your network and try again.";
  }
  return "Sign-in could not be completed. Please try again.";
}

export function friendlyRequestError(error: unknown): string {
  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("network") || normalized.includes("fetch")) {
      return "LeadSphere could not connect. Check your network and try again.";
    }
    if (error.message.trim()) return error.message;
  }
  return "The request could not be completed.";
}
