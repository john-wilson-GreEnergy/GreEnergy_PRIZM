process.env.NODE_ENV = "production";

const path = require("path");
const fs = require("fs");

const serverPath = path.join(__dirname, "dist", "server.cjs");

if (!fs.existsSync(serverPath)) {
  console.error("Missing dist/server.cjs. Run npm run build before npm start.");
  process.exit(1);
}

require(serverPath);
