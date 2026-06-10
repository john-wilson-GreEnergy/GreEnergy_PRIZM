const { execSync } = require("child_process");

try {
  const output = execSync("lsof -tiTCP:3000 -sTCP:LISTEN").toString().trim();
  if (output) {
    const pids = output.split('\n');
    console.log(`Killing processes on port 3000: ${pids.join(', ')}`);
    for (const pid of pids) {
      if (pid) {
        try {
          execSync(`kill -9 ${pid}`);
        } catch (err) {
          // Ignore
        }
      }
    }
  } else {
    console.log("No process listening on port 3000.");
  }
} catch (e) {
  console.log("No process listening on port 3000.");
}
