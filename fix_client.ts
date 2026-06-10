import fs from 'fs';

let content = fs.readFileSync('src/server/emsTurtleClient.ts', 'utf8');

// Replace DEMO_TEMPLATES with empty object to avoid breaking type inference if needed
// Actually, it's safer to remove the whole demo branch inside the functions. Let's see.
content = content.replace(/if \(isDemoActive\(\)\) \{([\s\S]*?)return \{([\s\S]*?)status: "demo"([\s\S]*?)\};/g, '');

// Alternatively, just force isDemoActive to return false
content = content.replace(/function isDemoActive\(\) \{[\s\S]*?\}/, 'function isDemoActive() { return false; }');

// We can just execute a regex to fix process.env demo toggles
content = content.replace(/enableDemoToggle:[^,]+,/g, '');

fs.writeFileSync('src/server/emsTurtleClient.ts', content);
