import "./styles/global.css";

import { render } from "preact";

import { App } from "./app/App";

const root = document.getElementById("app");
if (root) {
    render(<App />, root);
}
