import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import redesignHref from "./redesign-demo.css?url";
import responsiveHref from "./responsive-layout.css?url";

function createDemoStylesheet(href) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.donatelloDemoStyle = "true";
  document.head.appendChild(link);
  return link;
}

const demoStylesheets = [
  createDemoStylesheet(redesignHref),
  createDemoStylesheet(responsiveHref),
];

function syncDemoStyles() {
  const inventoryRoute =
    window.location.pathname === "/inventario" ||
    window.location.pathname.startsWith("/inventario/");

  demoStylesheets.forEach((link) => {
    link.disabled = inventoryRoute;
  });
}

const originalPushState = window.history.pushState.bind(window.history);
const originalReplaceState = window.history.replaceState.bind(window.history);

window.history.pushState = (...args) => {
  originalPushState(...args);
  queueMicrotask(syncDemoStyles);
};

window.history.replaceState = (...args) => {
  originalReplaceState(...args);
  queueMicrotask(syncDemoStyles);
};

window.addEventListener("popstate", syncDemoStyles);
syncDemoStyles();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
