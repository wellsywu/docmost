import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

try {
  process.loadEnvFile?.("../../.env");
} catch {
  // Environment variables supplied by the process remain authoritative.
}

const config = loadConfig();
const app = await buildApp(config);

await app.listen({
  host: config.PUBLISHER_HOST,
  port: config.PUBLISHER_PORT,
});
