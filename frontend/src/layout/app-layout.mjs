import React from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuthSession } from "../auth/react-auth-provider.mjs";

const PRIMARY_NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/feed", label: "Feed" },
  { to: "/profile", label: "Profile" },
];

export function AppLayout() {
  const location = useLocation();
  const { authContext, authView } = useAuthSession();
  const signInUrl = authContext.getSignInUrl(`${location.pathname}${location.search}${location.hash}`);
  const topBarModel = getTopBarModel(authView, { signInUrl });

  function handleSignOut() {
    authContext.signOut();
  }

  return React.createElement(
    "div",
    { className: "app-layout" },
    React.createElement(
      "header",
      { className: "app-topbar" },
      React.createElement(
        Link,
        { className: "app-topbar__brand", to: "/", "aria-label": "alex-1883-test-33 home" },
        "alex-1883-test-33",
      ),
      React.createElement(
        "nav",
        { className: "app-topbar__nav", "aria-label": "Primary" },
        PRIMARY_NAV_ITEMS.map((item) =>
          React.createElement(
            NavLink,
            {
              className: ({ isActive }) => `app-topbar__nav-link${isActive ? " app-topbar__nav-link--active" : ""}`,
              end: item.end,
              key: item.to,
              to: item.to,
            },
            item.label,
          ),
        ),
      ),
      React.createElement(TopBarAccount, { model: topBarModel, onSignOut: handleSignOut }),
    ),
    React.createElement(Outlet),
  );
}

export function getTopBarModel(authView, { signInUrl = "/api/auth/google" } = {}) {
  if (authView.isLoading) {
    return {
      status: "loading",
      label: "Loading",
      showSignIn: false,
      showUserMenu: false,
      signInUrl,
    };
  }

  if (authView.isSignedIn) {
    const user = authView.currentUser;
    return {
      status: "signed-in",
      label: user.displayName || user.email || "Profile",
      email: user.email || "",
      avatarUrl: user.avatarUrl || "",
      showSignIn: false,
      showUserMenu: true,
      signInUrl,
    };
  }

  return {
    status: authView.hasError ? "error" : "signed-out",
    label: "Sign in",
    errorMessage: authView.errorMessage || "",
    showSignIn: true,
    showUserMenu: false,
    signInUrl,
  };
}

function TopBarAccount({ model, onSignOut }) {
  if (model.showUserMenu) {
    return React.createElement(
      "div",
      { className: "app-account", "data-state": model.status },
      model.avatarUrl
        ? React.createElement("img", {
            alt: "",
            className: "app-account__avatar",
            loading: "lazy",
            src: model.avatarUrl,
          })
        : React.createElement(
            "span",
            { className: "app-account__initials", "aria-hidden": "true" },
            initialsFor(model.label),
          ),
      React.createElement(
        "div",
        { className: "app-account__body" },
        React.createElement(Link, { className: "app-account__name", to: "/profile" }, model.label),
        model.email ? React.createElement("span", { className: "app-account__email" }, model.email) : null,
      ),
      React.createElement(
        "button",
        { className: "app-account__sign-out", onClick: onSignOut, type: "button" },
        "Sign out",
      ),
    );
  }

  return React.createElement(
    "div",
    { className: "app-account", "data-state": model.status },
    model.status === "loading"
      ? React.createElement("span", { className: "app-account__loading", role: "status" }, model.label)
      : React.createElement("a", { className: "app-account__sign-in", href: model.signInUrl }, "Sign in"),
  );
}

function initialsFor(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return "U";
  }
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}
