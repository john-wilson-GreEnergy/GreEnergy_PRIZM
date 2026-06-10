import fs from 'fs';
let content = fs.readFileSync('server.ts', 'utf8');

const importStatement = `import safetyFaultClearRouter from "./src/server/safetyFaultClear";\n`;

if (!content.includes('safetyFaultClearRouter')) {
   content = importStatement + content;
}

const routeMount = `
app.use("/api/local/safety-fault-clear", safetyFaultClearRouter);

`;

if (!content.includes('/api/local/safety-fault-clear')) {
    const idx = content.indexOf('app.get("/api/local/status",');
    content = content.slice(0, idx) + routeMount + content.slice(idx);
}

fs.writeFileSync('server.ts', content);
