const fs = require("fs");
const path = require("path");

const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
const settingsPath = path.join(programData, "GreEnergy", "PRIZM", "Config", "settings.json");

try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const port = Number(settings.port);
  if (Number.isSafeInteger(port) && port > 0 && port <= 65535) {
    process.env.PORT = String(port);
  }
} catch (error) {
  console.warn(`[PRIZM Service] Using default port: ${error.message}`);
}

process.env.NODE_ENV = "production";
require("./start-production.cjs");
