// Tiny Chrome DevTools driver for live end-to-end checks: node web/scripts/e2e/drive.mjs <cmd> [...args].
// Start Chrome first with web/scripts/e2e/chrome.sh. `login <origin>` reads SITE_PASSWORD from web/.env.local (never printed)
// and turns on per-tab test mode, so this tab's traffic is tagged and left out of /insights.
// Commands: login, go, type, enter, click, buttons, text, waitfor, idle, shot, vp, view, eval.
const PORT = 9333;
const [cmd, ...args] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HELPERS = `
  window.__setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__btn = (t, nth=0) => [...document.querySelectorAll('button, a')].filter(b => b.innerText.trim().toLowerCase().includes(t.toLowerCase()) && !b.disabled)[nth];
`;
await evaluate(HELPERS);
const out = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1));
switch (cmd) {
  case "go": await send("Page.navigate", { url: args[0] }); await sleep(2500); out(await evaluate("location.href")); break;
  case "eval": out(await evaluate(args.join(" "))); break;
  case "type": { // type <css selector> <text...>
    out(await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(args[0])}); if (!el) return 'no element'; el.focus(); __setVal(el, ${JSON.stringify(args.slice(1).join(" "))}); return 'ok'; })()`));
    break;
  }
  case "enter": { // press Enter in selector (submits forms / ChatInput)
    out(await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(args[0])}); if (!el) return 'no element';
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); const f = el.closest('form'); if (f && el.tagName==='INPUT') f.requestSubmit(); return 'ok'; })()`));
    break;
  }
  case "click": out(await evaluate(`(() => { const b = __btn(${JSON.stringify(args[0])}, ${Number(args[1] ?? 0)}); if (!b) return 'no button: ' + ${JSON.stringify(args[0])}; b.click(); return 'clicked ' + b.innerText.trim().slice(0,60); })()`)); break;
  case "buttons": out(await evaluate(`[...document.querySelectorAll('button:not([disabled]), a')].map(b => b.innerText.trim().replace(/\\s+/g,' ').slice(0,50)).filter(Boolean).join(' | ')`)); break;
  case "text": { const n = Number(args[0] ?? 3000); out(await evaluate(`document.body.innerText.slice(-${n})`)); break; }
  case "waitfor": { // waitfor <text> [timeoutS] — waits until body text includes text
    const t0 = Date.now(); const lim = Number(args[1] ?? 120) * 1000;
    for (;;) { const ok = await evaluate(`document.body.innerText.includes(${JSON.stringify(args[0])})`); if (ok) { out(`found after ${Math.round((Date.now()-t0)/1000)}s`); break; }
      if (Date.now() - t0 > lim) { out("TIMEOUT"); break; } await sleep(1500); }
    break;
  }
  case "idle": { // waits until no spinner/status "thinking" and input enabled
    const t0 = Date.now(); const lim = Number(args[0] ?? 240) * 1000;
    for (;;) { const busy = await evaluate(`!!document.querySelector('[aria-busy="true"]') || /Claude is thinking|Tidying up my notes|Looking up sources|Finding good reading|Running code|Preparing a question|A boss approaches|tallying|Checking your answer|being written|Writing/.test(document.body.innerText.slice(-1500))`);
      if (!busy) { await sleep(1500); const still = await evaluate(`!!document.querySelector('[aria-busy="true"]')`); if (!still) { out(`idle after ${Math.round((Date.now()-t0)/1000)}s`); break; } }
      if (Date.now() - t0 > lim) { out("TIMEOUT"); break; } await sleep(2000); }
    break;
  }
  case "shot": { // shot <file> [width]
    const w = Number(args[1] ?? 900);
    const h = await evaluate("document.documentElement.scrollHeight");
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false });
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    (await import("node:fs")).writeFileSync(args[0], Buffer.from(r.result.data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 1000, deviceScaleFactor: 1, mobile: false });
    out(`saved ${args[0]} (${w}x${h})`); break;
  }
  case "view": { // screenshot of the current viewport scrolled to bottom
    await evaluate("window.scrollTo(0, document.body.scrollHeight)"); await sleep(400);
    const r = await send("Page.captureScreenshot", { format: "png" });
    (await import("node:fs")).writeFileSync(args[0], Buffer.from(r.result.data, "base64")); out(`saved ${args[0]}`); break;
  }
  case "vp": { const r = await send("Page.captureScreenshot", { format: "png" }); (await import("node:fs")).writeFileSync(args[0], Buffer.from(r.result.data, "base64")); out("saved " + args[0]); break; }
  case "login": { // login <origin>: posts SITE_PASSWORD (read from web/.env.local, never printed) to /api/access
    const env = (await import("node:fs")).readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
    const pw = (env.match(/^SITE_PASSWORD=(.*)$/m) || [])[1]?.trim();
    await send("Page.navigate", { url: args[0] + "/access" }); await sleep(2500);
    const r = await evaluate(`fetch('/api/access', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password: ${JSON.stringify(pw)}})}).then(r => r.status)`);
    // Per-tab test mode: this driver's tab tags its traffic (X-Colearn-Test) so /insights leaves it out.
    await evaluate(`sessionStorage.setItem('cl_test_tab', '1')`);
    out("access status " + r + ", test tab on"); break;
  }
}
ws.close();
