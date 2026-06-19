import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ConvexAppProvider } from "./providers/ConvexAppProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAppProvider>
      <App />
    </ConvexAppProvider>
  </StrictMode>,
);
