import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { createAuthContext, getAuthView } from "./auth-context.mjs";

const AuthSessionContext = createContext(null);

export function AuthProvider({ authContext, children }) {
  const resolvedAuthContext = useMemo(() => authContext ?? createAuthContext(), [authContext]);
  const [authState, setAuthState] = useState(() => resolvedAuthContext.getState());
  const authView = getAuthView(authState);
  const value = useMemo(
    () => ({
      authContext: resolvedAuthContext,
      authState,
      authView,
    }),
    [authState, authView, resolvedAuthContext],
  );

  useEffect(() => resolvedAuthContext.subscribe(setAuthState), [resolvedAuthContext]);

  useEffect(() => {
    void resolvedAuthContext.loadSession();
  }, [resolvedAuthContext]);

  return React.createElement(AuthSessionContext.Provider, { value }, children);
}

export function useAuthSession() {
  const session = useContext(AuthSessionContext);
  if (!session) {
    throw new Error("useAuthSession must be used within AuthProvider");
  }
  return session;
}
