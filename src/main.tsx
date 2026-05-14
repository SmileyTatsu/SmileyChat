import { render } from "preact";
import { App } from "./app/App";
import "./styles/global.css";

render(<App />, document.getElementById("app")!);
