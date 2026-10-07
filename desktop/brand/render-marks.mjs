import { writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

mkdirSync("/tmp/marks", { recursive: true });

const variants = {
  inlay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <path fill="#F4F7FB" fill-rule="evenodd" d="M9 3.2h14a5.8 5.8 0 0 1 5.8 5.8v14a5.8 5.8 0 0 1-5.8 5.8H9a5.8 5.8 0 0 1-5.8-5.8v-14A5.8 5.8 0 0 1 9 3.2zM9.4 7.5h13.2a1.9 1.9 0 0 1 1.9 1.9v13.2a1.9 1.9 0 0 1-1.9 1.9H9.4a1.9 1.9 0 0 1-1.9-1.9V9.4a1.9 1.9 0 0 1 1.9-1.9z"/>
    <path d="M21.2 3.2H28.8V7.1" fill="none" stroke="#9EBFDA" stroke-width="2.6" stroke-linejoin="miter" stroke-linecap="butt"/>
    <rect x="13.15" y="13.15" width="5.7" height="5.7" rx="1.15" fill="#F4F7FB"/>
  </svg>`,
  notch: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <path fill="#F4F7FB" fill-rule="evenodd" d="M9 3.2h14a5.8 5.8 0 0 1 5.8 5.8v14a5.8 5.8 0 0 1-5.8 5.8H9a5.8 5.8 0 0 1-5.8-5.8v-14A5.8 5.8 0 0 1 9 3.2zM9.4 7.5h13.2a1.9 1.9 0 0 1 1.9 1.9v13.2a1.9 1.9 0 0 1-1.9 1.9H9.4a1.9 1.9 0 0 1-1.9-1.9V9.4a1.9 1.9 0 0 1 1.9-1.9zM22.4 3.2H28.8V6.9H22.4z"/>
    <rect x="13.15" y="13.15" width="5.7" height="5.7" rx="1.15" fill="#F4F7FB"/>
  </svg>`,
  open: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <path d="M19.4 4.5H10.2A5.7 5.7 0 0 0 4.5 10.2v11.6a5.7 5.7 0 0 0 5.7 5.7h11.6a5.7 5.7 0 0 0 5.7-5.7V13" fill="none" stroke="#F4F7FB" stroke-width="2.6" stroke-linecap="butt"/>
    <path d="M22.6 4.5H27.5V9.4" fill="none" stroke="#9EBFDA" stroke-width="2.6" stroke-linecap="butt" stroke-linejoin="miter"/>
    <rect x="13.15" y="13.15" width="5.7" height="5.7" rx="1.15" fill="#F4F7FB"/>
  </svg>`,
};

function plate(inner, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="7" fill="#07111c"/>
    ${inner.replace(/<svg[^>]*>|<\/svg>/g, "")}
  </svg>`;
}

for (const [name, svg] of Object.entries(variants)) {
  for (const size of [256, 48, 32, 16]) {
    const png = new Resvg(plate(svg, size), { fitTo: { mode: "width", value: size } }).render().asPng();
    writeFileSync(`/tmp/marks/${name}-${size}.png`, png);
  }
}
console.log("ok");
