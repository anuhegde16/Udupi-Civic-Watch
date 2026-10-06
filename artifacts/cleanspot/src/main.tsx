// Must stay first: starts listening for the browser's "install app" signal before React loads.
import "./lib/install-prompt";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
