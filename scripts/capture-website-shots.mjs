/**
 * Capture real Traylist UI screenshots for the marketing website.
 * Requires vite (or tauri) on http://127.0.0.1:1420
 *
 *   node scripts/capture-website-shots.mjs
 */
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TRAYLIST_URL || "http://127.0.0.1:1420";
const OUT = path.resolve("website/assets");
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"].find((p) =>
    fs.existsSync(p)
  );

if (!CHROME) {
  console.error("Chrome/Chromium not found");
  process.exit(1);
}

const now = Date.now();
const todayEvening = new Date();
todayEvening.setHours(18, 0, 0, 0);
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(9, 30, 0, 0);
const fri = new Date();
fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7 || 7));
fri.setHours(14, 0, 0, 0);

const sampleState = {
  todos: [
    {
      id: "shot-1",
      text: "Review **mobile** layout",
      done: false,
      dueAt: todayEvening.getTime(),
      createdAt: now - 3_600_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
    {
      id: "shot-2",
      text: "Buy milk tomorrow 9am",
      done: false,
      dueAt: tomorrow.getTime(),
      createdAt: now - 7_200_000,
      updatedAt: now - 7_200_000,
      notifiedAt: null,
    },
    {
      id: "shot-3",
      text: "Email design notes",
      done: false,
      dueAt: fri.getTime(),
      createdAt: now - 86_400_000,
      updatedAt: now - 86_400_000,
      notifiedAt: null,
    },
    {
      id: "shot-4",
      text: "Polish tray panel",
      done: true,
      dueAt: todayEvening.getTime() - 86_400_000,
      createdAt: now - 172_800_000,
      updatedAt: now - 3_600_000,
      notifiedAt: null,
    },
  ],
  settings: { launchAtLogin: false, wifiSync: false },
  tombstones: [],
  bin: [],
};

async function mockTauri(page) {
  await page.evaluateOnNewDocument(() => {
    const handlers = new Map();
    window.__TAURI_INTERNALS__ = {
      transformCallback: (cb, once) => {
        const id = Math.random().toString(36).slice(2);
        handlers.set(id, { cb, once });
        return id;
      },
      unregisterCallback: (id) => handlers.delete(id),
      invoke: async (cmd) => {
        if (cmd === "plugin:autostart|is_enabled") return false;
        if (cmd === "plugin:notification|is_permission_granted") return false;
        if (String(cmd).includes("store")) return null;
        return null;
      },
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
    defaultViewport: null,
  });

  try {
    const desk = await browser.newPage();
    await desk.setViewport({ width: 420, height: 640, deviceScaleFactor: 2 });
    await mockTauri(desk);
    await desk.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 30000 });
    await desk.evaluate((state) => {
      localStorage.setItem("traylist.json", JSON.stringify(state));
      localStorage.removeItem("traylist.mobilePreview");
    }, sampleState);
    await desk.reload({ waitUntil: "networkidle0" });
    await desk.waitForSelector(".tray-panel", { timeout: 15000 });
    await desk.addStyleTag({
      content: `
        html, body, #root { background: #dcefed !important; min-height: 100% !important; }
        body {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 28px !important;
        }
        .app-shell.tray-panel { width: min(380px, 100%) !important; }
      `,
    });
    await new Promise((r) => setTimeout(r, 500));
    await desk.screenshot({ path: path.join(OUT, "shot-desktop.png"), type: "png" });
    console.log("wrote shot-desktop.png");

    await desk.click(
      'button[aria-label="More options"], button[aria-label*="More"], .tray-header-actions button:last-child'
    );
    await new Promise((r) => setTimeout(r, 350));
    await desk.evaluate(() => {
      const el = [...document.querySelectorAll("button,[role=menuitem]")].find((e) =>
        /Wi-?Fi Sync/i.test(e.textContent || "")
      );
      el?.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await desk.screenshot({ path: path.join(OUT, "shot-sync.png"), type: "png" });
    console.log("wrote shot-sync.png");

    const mob = await browser.newPage();
    await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await mob.goto(BASE + "/?mobile=1", { waitUntil: "networkidle0", timeout: 30000 });
    await mob.evaluate((state) => {
      localStorage.setItem("traylist.json", JSON.stringify(state));
      localStorage.setItem("traylist.mobilePreview", "1");
    }, sampleState);
    await mob.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 900));
    await mob.screenshot({ path: path.join(OUT, "shot-mobile.png"), type: "png" });
    console.log("wrote shot-mobile.png");

    const fab = await mob.$("[aria-label*='Add'], button.fab, .fab");
    if (fab) {
      await fab.click();
      await new Promise((r) => setTimeout(r, 600));
      await mob.screenshot({ path: path.join(OUT, "shot-mobile-add.png"), type: "png" });
      console.log("wrote shot-mobile-add.png");
    }

    const device = "/tmp/traylist-check.png";
    if (fs.existsSync(device)) {
      fs.copyFileSync(device, path.join(OUT, "shot-android-device.png"));
      console.log("wrote shot-android-device.png (from device screencap)");
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
