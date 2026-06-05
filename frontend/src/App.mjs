import React from "react";

export function App() {
  return React.createElement(
    "main",
    { className: "app-shell" },
    React.createElement(
      "header",
      { className: "app-header" },
      React.createElement("h1", null, "alex-1883-test-33"),
      React.createElement("p", null, "React frontend scaffold"),
    ),
    React.createElement(
      "section",
      { className: "app-panel", "aria-label": "Application status" },
      React.createElement("h2", null, "Ready"),
      React.createElement("p", null, "Frontend and backend projects are wired with separate start scripts."),
    ),
  );
}
