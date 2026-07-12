import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BoardItemViewProvider } from "./providers/BoardItemViewProvider";
import { ConvexAppProvider } from "./providers/ConvexAppProvider";
import { UserTagsProvider } from "./providers/UserTagsProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAppProvider>
      <UserTagsProvider>
        <BoardItemViewProvider>
          <App />
        </BoardItemViewProvider>
      </UserTagsProvider>
    </ConvexAppProvider>
  </StrictMode>,
);
