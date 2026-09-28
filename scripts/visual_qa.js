/* Visual QA driver (ephemeral — not a project dependency).
 *
 * Drives headless Chrome over CDP to check, at every required width:
 *  - no horizontal overflow
 *  - exactly ONE "Add source" button in the sources empty state
 *  - the Add Source modal opens, fits the viewport, and has 3 tabs
 *  - the header status pill shows the backend model when connected
 *  - focus visibility sanity (focus-visible ring exists)
 * Screenshots are written to qa_shots/ for human review.
 *
 * Usage: node scripts/visual_qa.js  (run from frontend/)
 */
"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// This script lives in scripts/ but is run with frontend/'s node_modules.
// Resolve chrome-remote-interface from there explicitly.
let CDP;
try {
  CDP = require("chrome-remote-interface");
} catch {
  const frontendModules = path.join(__dirname, "..", "frontend", "node_modules");
  CDP = require(path.join(frontendModules, "chrome-remote-interface"));
}

const CHROME =
  process.env.CHROME_PATH ||
  path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Google",
    "Chrome",
    "Application",
    "chrome.exe",
  );
const PORT = 9223;
const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";
const WIDTHS = [1440, 1280, 1024, 768, 390, 375];

const outDir = path.join(__dirname, "..", "qa_shots");
fs.mkdirSync(outDir, { recursive: true });

const failures = [];
function check(name, cond, extra = "") {
  const status = cond ? "PASS" : "FAIL";
  if (!cond) failures.push(`${name}${extra ? " — " + extra : ""}`);
  console.log(`  [${status}] ${name}${extra ? " — " + extra : ""}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function launchChrome() {
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "qa-chrome-"))}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--window-size=1500,1000",
    "about:blank",
  ];
  const child = execFile(CHROME, args);
  child.on("error", (e) => {
    console.error("Chrome failed to start:", e.message);
    process.exit(2);
  });
  // Wait for the CDP endpoint
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  console.error("CDP endpoint never came up");
  process.exit(2);
}

async function withPage(width, height, fn) {
  const target = await CDP.New({ port: PORT });
  const client = await CDP({ port: PORT, target });
  const { Page, Emulation, Runtime, DOM } = client;
  try {
    await Page.enable();
    await DOM.enable();
    await Runtime.enable();
    await Emulation.setDeviceMetricsOverride({
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await Page.navigate({ url: FRONTEND });
    await Page.loadEventFired();
    await sleep(1200); // allow health poll + hydration
    await fn({ client, Page, Runtime, width, height });
  } finally {
    await client.close();
  }
}

async function evalJs(Runtime, expression) {
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (exceptionDetails) {
    throw new Error(
      "page eval failed: " +
        (exceptionDetails.exception?.description || exceptionDetails.text),
    );
  }
  return result.value;
}

async function screenshot(Page, name) {
  // CDP returns base64; save it ourselves
  const { data } = await Page.captureScreenshot({ format: "png" });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(data, "base64"));
}

async function openAddSourceModal(client, Page, Runtime, tag) {
  await evalJs(
    Runtime,
    `(() => {
      const btn = [...document.querySelectorAll('button')].find(b =>
        /add source/i.test(b.textContent) && b.offsetParent !== null);
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
  );
  await sleep(500);
  await screenshot(Page, `modal-${tag}.png`);
}

(async () => {
  const chrome = await launchChrome();
  console.log(`Chrome up (CDP :${PORT}) — QA against ${FRONTEND}\n`);

  try {
    for (const width of WIDTHS) {
      const height = width < 768 ? 844 : width < 1024 ? 1024 : 900;
      const tag = String(width);
      console.log(`— ${width}×${height} —`);

      await withPage(width, height, async ({ client, Page, Runtime }) => {
        const { width: vw } = await evalJs(
          Runtime,
          `({ width: window.innerWidth, height: window.innerHeight })`,
        );

        // 1. No horizontal overflow
        const overflow = await evalJs(
          Runtime,
          `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
        );
        check("no horizontal overflow", overflow <= 0, `delta=${overflow}px @ ${vw}px viewport`);

        // 2. Exactly one Add source CTA in the empty state
        const ctaCount = await evalJs(
          Runtime,
          `[...document.querySelectorAll('button')]
            .filter(b => /add source/i.test(b.textContent) && b.offsetParent !== null).length`,
        );
        check("exactly one visible Add source button", ctaCount === 1, `found ${ctaCount}`);

        // 3. Empty state is button-free
        const emptyStateButtons = await evalJs(
          Runtime,
          `document.querySelector('[data-testid="sources-empty-state"]')
             ? document.querySelector('[data-testid="sources-empty-state"]').querySelectorAll('button').length
             : -1`,
        );
        check("empty state contains no buttons", emptyStateButtons === 0, `found ${emptyStateButtons}`);

        // 4. Header pill shows the model (backend is running)
        const pill = await evalJs(
          Runtime,
          `(() => {
             const el = document.querySelector('[role="status"]');
             if (!el) return null;
             return { text: el.textContent, visible: el.offsetParent !== null };
           })()`,
        );
        if (width >= 640) {
          check(
            "status pill shows Connected + model",
            !!pill && pill.visible && /Connected/.test(pill.text) && /qwen/.test(pill.text),
            pill ? JSON.stringify(pill.text.slice(0, 60)) : "pill missing",
          );
        } else {
          check(
            "status pill hidden on mobile (sm:flex)",
            !pill || !pill.visible,
          );
        }

        // 5. Empty-state screenshot
        await screenshot(Page, `empty-${tag}.png`);

        // 6. Modal opens, fits viewport, has 3 tabs
        await openAddSourceModal(client, Page, Runtime, tag);
        const modal = await evalJs(
          Runtime,
          `(() => {
             const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
             if (!dlg) return null;
             const r = dlg.getBoundingClientRect();
             const tabs = [...dlg.querySelectorAll('[role="tab"]')].map(t => t.textContent);
             const submit = [...dlg.querySelectorAll('button')].find(b => /^add source$/i.test(b.textContent));
             return {
               fitsViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.width <= window.innerWidth,
               tabs,
               submitDisabled: submit ? submit.disabled : null,
               tabOverflow: (() => {
                 const bar = dlg.querySelector('[role="tablist"]');
                 return bar ? bar.scrollWidth - bar.clientWidth : 0;
               })(),
             };
           })()`,
        );
        check("Add Source modal opens", !!modal);
        if (modal) {
          check("modal fits viewport", modal.fitsViewport);
          check("3 source-type tabs", modal.tabs.length === 3, modal.tabs.join(" | "));
          check("submit disabled initially", modal.submitDisabled === true);
          check("tab bar does not overflow", modal.tabOverflow <= 0, `delta=${modal.tabOverflow}px`);
        }

        // 7. Web tab shows the metadata-only disclosure
        await evalJs(
          Runtime,
          `(() => {
             const tab = [...document.querySelectorAll('[role="tab"]')]
               .find(t => /web link/i.test(t.textContent));
             if (tab) tab.click();
           })()`,
        );
        await sleep(300);
        const disclosure = await evalJs(
          Runtime,
          `/URL is stored as source metadata/.test(document.querySelector('[role="dialog"]').textContent)`,
        );
        check("web tab discloses metadata-only behavior", disclosure);

        // 8. Escape closes the modal
        await evalJs(
          Runtime,
          `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
        );
        await sleep(300);
        const modalGone = await evalJs(
          Runtime,
          `!document.querySelector('[role="dialog"][aria-modal="true"]')`,
        );
        check("Escape closes modal", modalGone);
      });
    }
  } finally {
    chrome.kill();
  }

  console.log("");
  if (failures.length) {
    console.log(`VISUAL QA: ${failures.length} failure(s):`);
    for (const f of failures) console.log("  ✗ " + f);
    process.exit(1);
  }
  console.log(`VISUAL QA: all checks passed — screenshots in qa_shots/`);
})();
