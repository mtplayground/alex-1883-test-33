export const PROTECTED_ROUTE_PATTERNS = ["/feed", "/profile", "/post/:id"];

export function getHomeRouteDecision(authView) {
  if (authView.isLoading) {
    return {
      action: "loading",
      target: "",
    };
  }

  if (authView.isSignedIn) {
    return {
      action: "redirect",
      target: "/feed",
    };
  }

  return {
    action: "landing",
    target: "",
  };
}

export function getProtectedRouteDecision(authView, { signInUrl = "/auth/google" } = {}) {
  if (authView.isLoading) {
    return {
      action: "loading",
      signInUrl,
    };
  }

  if (authView.isSignedIn) {
    return {
      action: "allow",
      signInUrl,
    };
  }

  return {
    action: "redirect",
    signInUrl,
  };
}
