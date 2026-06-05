import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.mjs";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

createRoot(rootElement).render(React.createElement(React.StrictMode, null, React.createElement(App)));
