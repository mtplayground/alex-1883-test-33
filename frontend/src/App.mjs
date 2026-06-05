import React, { useEffect, useMemo, useRef } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";

import { createAuthCallbackPage, parseAuthCallbackUrl } from "./auth/sign-in-flow.mjs";
import { createProfilePage } from "./auth/profile-page.mjs";
import { AuthProvider, useAuthSession } from "./auth/react-auth-provider.mjs";
import { getHomeRouteDecision, getProtectedRouteDecision } from "./auth/route-guards.mjs";
import { APP_ROUTES } from "./app-routes.mjs";
import { createFeedPage } from "./feed/feed-page.mjs";
import { AppLayout } from "./layout/app-layout.mjs";
import { createPostDetailPage } from "./posts/post-detail-page.mjs";
import { createImagePostComposer } from "./uploads/image-post-composer.mjs";

import "./auth/profile-page.css";
import "./auth/sign-in-flow.css";
import "./comments/comment-thread.css";
import "./feed/feed-page.css";
import "./follows/follow-toggle.css";
import "./likes/like-toggle.css";
import "./posts/post-card.css";
import "./posts/post-detail-page.css";
import "./uploads/image-post-composer.css";

export { APP_ROUTES };

export function App() {
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(
      BrowserRouter,
      null,
      React.createElement(
        Routes,
        null,
        React.createElement(
          Route,
          { element: React.createElement(AppLayout) },
          React.createElement(Route, { path: "/", element: React.createElement(HomeRoute) }),
          React.createElement(Route, {
            path: "/feed",
            element: React.createElement(ProtectedRoute, null, React.createElement(FeedRoute)),
          }),
          React.createElement(Route, {
            path: "/profile",
            element: React.createElement(ProtectedRoute, null, React.createElement(ProfileRoute)),
          }),
          React.createElement(Route, {
            path: "/post/:id",
            element: React.createElement(ProtectedRoute, null, React.createElement(PostDetailRoute)),
          }),
          React.createElement(Route, { path: "/auth/callback", element: React.createElement(AuthCallbackRoute) }),
          React.createElement(Route, { path: "*", element: React.createElement(NotFoundRoute) }),
        ),
      ),
    ),
  );
}

function HomeRoute() {
  const { authView } = useAuthSession();
  const decision = getHomeRouteDecision(authView);

  if (decision.action === "loading") {
    return React.createElement(RouteStatus, {
      title: "Loading session",
      message: "Checking whether to open the feed or the public route overview.",
    });
  }

  if (decision.action === "redirect") {
    return React.createElement(Navigate, { replace: true, to: decision.target });
  }

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

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { authContext, authView } = useAuthSession();
  const signInUrl = authContext.getSignInUrl(`${location.pathname}${location.search}${location.hash}`);
  const decision = getProtectedRouteDecision(authView, { signInUrl });

  if (decision.action === "loading") {
    return React.createElement(RouteStatus, {
      title: "Loading session",
      message: "Checking whether this route is available for your account.",
    });
  }

  if (decision.action === "redirect") {
    return React.createElement(SignInRedirect, { signInUrl: decision.signInUrl });
  }

  return children;
}

function SignInRedirect({ signInUrl }) {
  useEffect(() => {
    globalThis.location?.assign?.(signInUrl);
  }, [signInUrl]);

  return React.createElement(RouteStatus, {
    action: React.createElement("a", { className: "route-action", href: signInUrl }, "Continue to Sign in"),
    title: "Sign in required",
    message: "Redirecting to Google sign in.",
  });
}

function FeedRoute() {
  const apiClient = useAppApiClient();
  const { authView } = useAuthSession();
  const mountFeedPage = useMemo(
    () => () => {
      const root = document.createElement("section");
      root.className = "feed-workflow";
      root.setAttribute("aria-label", "Create and browse posts");

      const feedPage = createFeedPage({
        apiClient,
        initialPosts: [],
      });
      const composer = createImagePostComposer({
        apiClient,
        currentUser: authView.currentUser,
        onPostCreated(createdPost) {
          feedPage.prependPost(createdPost);
        },
      });

      root.append(composer.element, feedPage.element);

      return {
        element: root,
        disconnect() {
          composer.destroy();
          feedPage.disconnect();
        },
      };
    },
    [apiClient, authView.currentUser],
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
  const { authView } = useAuthSession();
  const mountProfilePage = useMemo(
    () => () => {
      const page = createProfilePage({ currentUser: authView.currentUser });
      if (authView.currentUser) {
        page.setState({ currentUser: authView.currentUser });
      } else {
        page.setState({ status: "signed-out" });
      }
      return page;
    },
    [authView.currentUser],
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
  const apiClient = useAppApiClient();
  const { authView } = useAuthSession();
  const mountPostDetailPage = useMemo(
    () => () =>
      createPostDetailPage({
        apiClient,
        currentUser: authView.currentUser,
        postId,
      }),
    [apiClient, authView.currentUser, postId],
  );

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Post detail",
      title: "Post detail",
      description: "Post card, author follow control, likes, and comments are assembled on this route.",
    },
    postId
      ? React.createElement(DomPageMount, { factory: mountPostDetailPage })
      : React.createElement(
          "section",
          { className: "route-panel", "aria-label": "Selected post" },
          React.createElement("h2", null, "Selected post"),
          React.createElement("p", null, "No post id was provided."),
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

function RouteStatus({ title, message, action = null }) {
  return React.createElement(
    "main",
    { className: "app-shell route-shell", "aria-labelledby": "route-status-title" },
    React.createElement(
      "section",
      { className: "route-panel", role: "status" },
      React.createElement("h1", { id: "route-status-title" }, title),
      React.createElement("p", null, message),
      action,
    ),
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
  const { authContext } = useAuthSession();
  return authContext.getApiClient();
}
