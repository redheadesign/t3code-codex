import tailwind from "@tailwindcss/browser?raw";
import gsap from "gsap/dist/gsap.min.js?raw";
import scrollTrigger from "gsap/dist/ScrollTrigger.min.js?raw";
import type { DesignWidgetSource } from "./designWidgetSource";

export function designWidgetSrcDoc(source: DesignWidgetSource): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const script = (code: string) =>
    `<script nonce="${nonce}">${code.replace(/<\/script/giu, "<\\/script")}</script>`;
  const data = JSON.stringify(source).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src data: blob:; base-uri 'none'; form-action 'none'">
${script(tailwind)}${script(gsap)}${script(scrollTrigger)}
</head><body>${script(`
(() => {
  const source = ${data};
  if (source.css) {
    const style = document.createElement("style");
    style.type = "text/tailwindcss";
    style.textContent = source.css;
    document.head.append(style);
  }
  const html = document.createElement("template");
  html.innerHTML = source.html;
  for (const element of html.content.querySelectorAll("meta, base, script")) element.remove();
  document.body.append(html.content);
  gsap.registerPlugin(ScrollTrigger);
  const program = document.createElement("script");
  program.nonce = "${nonce}";
  program.textContent = source.js;
  document.body.append(program);
  window.addEventListener("load", () => requestAnimationFrame(() => ScrollTrigger.refresh()));
})();
`)}</body></html>`;
}
