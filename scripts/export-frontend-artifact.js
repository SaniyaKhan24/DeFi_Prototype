/**
 * Writes a small JSON (abi + networks only) for the browser to avoid loading full bytecode.
 * Run after: truffle compile && truffle migrate
 */
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "build", "contracts", "DecentralizedBank.json");
const dest = path.join(__dirname, "..", "frontend", "js", "artifact-lite.json");

if (!fs.existsSync(src)) {
  console.error("Missing", src, "— run: npm run compile && npm run migrate");
  process.exit(1);
}

const full = JSON.parse(fs.readFileSync(src, "utf8"));
const lite = { contractName: full.contractName, abi: full.abi, networks: full.networks || {} };
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(lite, null, 0));
console.log("Wrote", dest);

const destGlobal = path.join(__dirname, "..", "frontend", "js", "artifact-lite-global.js");
fs.writeFileSync(
  destGlobal,
  "/* Auto-generated — do not edit. Run: npm run export:frontend */\nwindow.__DBANK_ARTIFACT__=" +
    JSON.stringify(lite) +
    ";\n"
);
console.log("Wrote", destGlobal);
