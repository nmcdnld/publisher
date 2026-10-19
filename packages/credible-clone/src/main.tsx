// Copyright (c) Credible Data Inc.
// SPDX-License-Identifier: MIT

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Before App, so its layer order is declared ahead of the explorer's styles.
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
   <StrictMode>
      <BrowserRouter>
         <App />
      </BrowserRouter>
   </StrictMode>,
);
