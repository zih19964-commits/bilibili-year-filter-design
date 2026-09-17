const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = [
  ...fs.readdirSync(path.join(root, "starter/extension/src/core"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => path.join(root, "starter/extension/src/core", file)),
  path.join(root, "starter/extension/src/adapters/bilibili-adapter.js"),
  path.join(root, "starter/extension/src/adapters/generic-card-adapter.js"),
  path.join(root, "starter/extension/src/content.js"),
  path.join(root, "starter/extension/popup.js"),
  path.join(root, "starter/tampermonkey/bilibili-year-filter.user.js"),
];

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.log(`syntax ok: ${files.length} files`);
