import { createRequire } from "node:module";

/** Package version, read at runtime so the server and demo never report a stale version. */
export const VERSION: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
