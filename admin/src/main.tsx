import "./auth/security.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AdminSession } from "./auth/AdminSession";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminSession>
      <App />
    </AdminSession>
  </React.StrictMode>,
);
