/**
 * The SmileyChat version this build reports to plugins and to the installer.
 *
 * `package.json` is the single source of truth so a plugin's `minAppVersion`
 * check can never disagree with the shipped app version. The server imports
 * this module too (plugins are validated before they reach the browser).
 */
import packageJson from "../../package.json";

export const APP_VERSION: string = packageJson.version;
