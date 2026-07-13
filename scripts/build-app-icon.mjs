import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
let symbol = fs.readFileSync(path.join(root, "tmp", "buddio-symbol.svg"), "utf8");
symbol = symbol
  .replace(/var\(--fill-0,\s*#5B4DFF\)/g, "#5B4DFF")
  .replace(/var\(--fill-0,\s*white\)/g, "#FFFFFF")
  .replace(/width="100%" height="100%"/, 'width="164" height="164"');

const m = symbol.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
if (!m) throw new Error("no svg body");
const inner = m[1];

const out = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="220" fill="#FFFFFF"/>
  <g transform="translate(168 168) scale(4.195)">${inner}</g>
</svg>`;

fs.mkdirSync(path.join(root, "src", "assets", "brand"), { recursive: true });
fs.writeFileSync(path.join(root, "tmp", "app-icon.svg"), out);
fs.writeFileSync(path.join(root, "src", "assets", "brand", "app-icon.svg"), out);
console.log("wrote app-icon.svg", out.length);
