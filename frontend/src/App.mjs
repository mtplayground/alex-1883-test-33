import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { parseAuthCallbackUrl } from "./auth/sign-in-flow.mjs";
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
          React.createElement(Route, { path: "/auth/google", element: React.createElement(AuthStartRoute) }),
          React.createElement(Route, { path: "/auth/callback", element: React.createElement(AuthCallbackRoute) }),
          React.createElement(Route, { path: "*", element: React.createElement(NotFoundRoute) }),
        ),
      ),
    ),
  );
}

function HomeRoute() {
  const { authContext, authView } = useAuthSession();
  const decision = getHomeRouteDecision(authView);
  const signInUrl = authContext.getSignInUrl("/feed");

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
      React.createElement("p", { className: "app-eyebrow" }, "Photo sharing"),
      React.createElement("h1", { id: "home-title" }, "Share photos with the people you follow"),
      React.createElement(
        "p",
        { className: "app-hero__copy" },
        "Post images, follow other creators, and keep up with a focused feed of photo updates.",
      ),
      React.createElement(
        "div",
        { className: "app-hero__actions" },
        React.createElement(Link, { className: "route-action route-action--primary", to: "/feed" }, "Open feed"),
        React.createElement("a", { className: "route-action", href: signInUrl }, "Sign in"),
      ),
    ),
    React.createElement(
      "section",
      { className: "app-feature-grid", "aria-label": "Core features" },
      React.createElement(
        "article",
        { className: "app-feature-card" },
        React.createElement("h2", null, "Photo posts"),
        React.createElement("p", null, "Create image posts with captions and keep the latest updates easy to scan."),
      ),
      React.createElement(
        "article",
        { className: "app-feature-card" },
        React.createElement("h2", null, "Focused feed"),
        React.createElement("p", null, "Browse your posts and followed accounts in one paginated timeline."),
      ),
      React.createElement(
        "article",
        { className: "app-feature-card" },
        React.createElement("h2", null, "Social actions"),
        React.createElement("p", null, "Like, comment, and follow directly from post detail views."),
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
  return React.createElement(RouteStatus, {
    title: "Sign in required",
    message:
      "This page is part of the signed-in photo workflow. Use Google sign in when it is configured for this deployment, then return here to create posts, browse the feed, and use likes, comments, and follows.",
    action: React.createElement(
      "div",
      { className: "route-actions" },
      React.createElement(
        "a",
        { className: "route-action route-action--primary", href: signInUrl },
        "Continue to Sign in",
      ),
      React.createElement(Link, { className: "route-action", to: "/" }, "Back home"),
    ),
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
      description: "Create an image post and browse updates from your account and followed users.",
    },
    React.createElement(DomPageMount, { factory: mountFeedPage }),
  );
}

function ProfileRoute() {
  const apiClient = useAppApiClient();
  const { authView } = useAuthSession();
  const mountProfilePage = useMemo(
    () => () => {
      const page = createProfilePage({ apiClient, currentUser: authView.currentUser });
      if (authView.currentUser) {
        page.setState({ currentUser: authView.currentUser });
      } else {
        page.setState({ status: "signed-out" });
      }
      void page.refresh();
      return page;
    },
    [apiClient, authView.currentUser],
  );

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Profile",
      title: "Profile",
      description: "Review the signed-in Google profile details loaded from the API.",
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
      description: "View the selected photo with follow, like, and comment controls.",
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

function AuthStartRoute() {
  const location = useLocation();
  const { authContext } = useAuthSession();
  const next = new URLSearchParams(location.search).get("next") || "/";
  const signInUrl = authContext.getSignInUrl(next);

  useEffect(() => {
    globalThis.location?.assign?.(signInUrl);
  }, [signInUrl]);

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Sign in",
      title: "Sign in with Google",
      description: "Start authentication before opening protected feed, profile, and post routes.",
    },
    React.createElement(
      "section",
      { className: "route-panel", "aria-label": "Google sign in" },
      React.createElement("h2", null, "Google sign in"),
      React.createElement("p", null, "Opening the Google sign in flow."),
      React.createElement("a", { className: "route-action", href: signInUrl }, "Continue to Google"),
    ),
  );
}

function AuthCallbackRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const { authContext } = useAuthSession();
  const [callbackState, setCallbackState] = useState({
    status: "loading",
    errorMessage: "",
  });

  useEffect(() => {
    let isActive = true;
    const parsed = parseAuthCallbackUrl(`${location.pathname}${location.search}${location.hash}`);

    if (parsed.hasOAuthError) {
      setCallbackState({
        status: "error",
        errorMessage: parsed.errorDescription || parsed.error,
      });
      return () => {
        isActive = false;
      };
    }

    if (!parsed.hasCode) {
      setCallbackState({
        status: "error",
        errorMessage: "Missing Google authorization code.",
      });
      return () => {
        isActive = false;
      };
    }

    setCallbackState({ status: "loading", errorMessage: "" });
    authContext
      .completeGoogleCallback({ code: parsed.code, state: parsed.state })
      .then((nextState) => {
        if (!isActive) {
          return;
        }
        if (nextState.status === "signed-in") {
          setCallbackState({ status: "success", errorMessage: "" });
          navigate(nextState.redirectTo || "/feed", { replace: true });
          return;
        }
        setCallbackState({
          status: "error",
          errorMessage: nextState.errorMessage || "Unable to complete sign in.",
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        setCallbackState({
          status: "error",
          errorMessage: error?.message || "Unable to complete sign in.",
        });
      });

    return () => {
      isActive = false;
    };
  }, [authContext, location.hash, location.pathname, location.search, navigate]);

  const isLoading = callbackState.status === "loading";
  const hasError = callbackState.status === "error";

  return React.createElement(
    RouteShell,
    {
      eyebrow: "Auth callback",
      title: "Sign in callback",
      description: "Completes the Google OAuth callback route after the provider redirects back.",
    },
    React.createElement(
      "section",
      { className: "route-panel", "aria-label": "Sign in callback", role: isLoading ? "status" : undefined },
      React.createElement("h2", null, isLoading ? "Completing sign in" : hasError ? "Sign in failed" : "Signed in"),
      React.createElement(
        "p",
        { role: hasError ? "alert" : undefined },
        hasError
          ? callbackState.errorMessage
          : isLoading
            ? "Exchanging the Google authorization code."
            : "Redirecting.",
      ),
      hasError
        ? React.createElement("a", { className: "route-action", href: authContext.getSignInUrl("/feed") }, "Try again")
        : null,
    ),
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
      React.createElement(Link, { className: "route-action", to: "/" }, "Home"),
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
