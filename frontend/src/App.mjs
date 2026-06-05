import React, { useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router-dom";

import { createApiClient, createLocalStorageTokenStore } from "./auth/api-client.mjs";
import { createAuthCallbackPage, parseAuthCallbackUrl } from "./auth/sign-in-flow.mjs";
import { createProfilePage } from "./auth/profile-page.mjs";
import { APP_ROUTES } from "./app-routes.mjs";
import { createFeedPage } from "./feed/feed-page.mjs";
import { AppLayout } from "./layout/app-layout.mjs";

import "./auth/profile-page.css";
import "./auth/sign-in-flow.css";
import "./feed/feed-page.css";
import "./posts/post-card.css";

export { APP_ROUTES };

export function App() {
  return React.createElement(
    BrowserRouter,
    null,
    React.createElement(
      Routes,
      null,
      React.createElement(
        Route,
        { element: React.createElement(AppLayout) },
        React.createElement(Route, { path: "/", element: React.createElement(HomeRoute) }),
        React.createElement(Route, { path: "/feed", element: React.createElement(FeedRoute) }),
        React.createElement(Route, { path: "/profile", element: React.createElement(ProfileRoute) }),
        React.createElement(Route, { path: "/post/:id", element: React.createElement(PostDetailRoute) }),
        React.createElement(Route, { path: "/auth/callback", element: React.createElement(AuthCallbackRoute) }),
        React.createElement(Route, { path: "*", element: React.createElement(NotFoundRoute) }),
      ),
    ),
  );
}

function HomeRoute() {
  return React.createElement(
    "main",
    { className: "app-shell", "aria-labelledby": "home-title" },
    React.createElement(
      "section",
      { className: "app-hero" },
      React.createElement("p", { className: "app-eyebrow" }, "Photo sharing routes"),
      React.createElement("h1", { id: "home-title" }, "alex-1883-test-33"),
      React.createElement(
        "p",
        { className: "app-hero__copy" },
        "The routed application shell is active. Use the primary routes below to enter feed, profile, post, or sign-in callback flows.",
      ),
    ),
    React.createElement(
      "nav",
      { className: "route-grid", "aria-label": "Application routes" },
      APP_ROUTES.filter((route) => route.path !== "/").map((route) =>
        React.createElement(
          Link,
          {
            className: "route-link",
            key: route.path,
            to: route.path === "/post/:id" ? "/post/example-post" : route.path,
          },
          React.createElement("span", { className: "route-link__label" }, route.label),
          React.createElement("span", { className: "route-link__path" }, route.path),
        ),
      ),
    ),
  );
}

function FeedRoute() {
  const apiClient = useAppApiClient();
  const mountFeedPage = useMemo(
    () => () =>
      createFeedPage({
        apiClient,
        initialPosts: [],
      }),
    [apiClient],
  );

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Feed",
      title: "Feed",
      description: "Browse paginated posts from the current user and followed accounts.",
    },
    React.createElement(DomPageMount, { factory: mountFeedPage }),
  );
}

function ProfileRoute() {
  const mountProfilePage = useMemo(
    () => () => {
      const page = createProfilePage();
      page.setState({ status: "signed-out" });
      return page;
    },
    [],
  );

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Profile",
      title: "Profile",
      description: "Current-user profile route mounted for the authenticated profile experience.",
    },
    React.createElement(DomPageMount, { factory: mountProfilePage }),
  );
}

function PostDetailRoute() {
  const params = useParams();
  const postId = params.id || "";

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Post detail",
      title: "Post detail",
      description: "Route context is ready for the post interaction assembly.",
    },
    React.createElement(
      "section",
      { className: "route-panel", "aria-label": "Selected post" },
      React.createElement("h2", null, "Selected post"),
      React.createElement("p", null, postId ? `Post id: ${postId}` : "No post id was provided."),
    ),
  );
}

function AuthCallbackRoute() {
  const mountCallbackPage = useMemo(
    () => () => {
      const page = createAuthCallbackPage();
      const parsed = parseAuthCallbackUrl(globalThis.location?.href ?? "/auth/callback");
      if (parsed.hasOAuthError) {
        page.setState({
          status: "error",
          errorMessage: parsed.errorDescription || parsed.error,
        });
      } else if (parsed.hasCode) {
        page.setState({
          status: "success",
          code: parsed.code,
          state: parsed.state,
        });
      } else {
        page.setState({
          status: "error",
          errorMessage: "Missing Google authorization code.",
        });
      }
      return page;
    },
    [],
  );

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Auth callback",
      title: "Sign in callback",
      description: "Handles the Google OAuth callback route after the provider redirects back.",
    },
    React.createElement(DomPageMount, { factory: mountCallbackPage }),
  );
}

function NotFoundRoute() {
  return React.createElement(
    RouteShell,
    {
      eyebrow: "Not found",
      title: "Route not found",
      description: "Choose one of the configured application routes.",
    },
    React.createElement(Link, { className: "route-action", to: "/" }, "Back to routes"),
  );
}

function RouteShell({ eyebrow, title, description, children }) {
  return React.createElement(
    "main",
    { className: "app-shell route-shell", "aria-labelledby": "route-title" },
    React.createElement(
      "header",
      { className: "route-header" },
      React.createElement("p", { className: "app-eyebrow" }, eyebrow),
      React.createElement("h1", { id: "route-title" }, title),
      React.createElement("p", null, description),
      React.createElement(Link, { className: "route-action", to: "/" }, "All routes"),
    ),
    children,
  );
}

function DomPageMount({ factory }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const mounted = factory();
    const container = containerRef.current;
    if (!container) {
      mounted.disconnect?.();
      return undefined;
    }

    container.replaceChildren(mounted.element);
    return () => {
      mounted.disconnect?.();
      container.replaceChildren();
    };
  }, [factory]);

  return React.createElement("div", { className: "dom-page-mount", ref: containerRef });
}

function useAppApiClient() {
  return useMemo(
    () =>
      createApiClient({
        tokenStore: createLocalStorageTokenStore(),
      }),
    [],
  );
}
