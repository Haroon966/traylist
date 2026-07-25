(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  const toggle = document.querySelector(".nav__toggle");
  const menu = document.getElementById("nav-menu");
  const navLinks = menu ? [...menu.querySelectorAll("a")] : [];

  const closeMenu = () => {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    menu.classList.remove("is-open");
    document.body.classList.remove("nav-open");
  };

  const openMenu = () => {
    if (!toggle || !menu) return;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    menu.classList.add("is-open");
    document.body.classList.add("nav-open");
  };

  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    if (open) closeMenu();
    else openMenu();
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => closeMenu());
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (e) => {
    if (!menu?.classList.contains("is-open")) return;
    const nav = document.querySelector(".nav");
    if (nav && !nav.contains(e.target)) closeMenu();
  });

  window.addEventListener(
    "resize",
    () => {
      if (window.matchMedia("(min-width: 901px)").matches) closeMenu();
    },
    { passive: true }
  );

  const sections = ["home", "about", "features", "desktop", "android", "sync"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const setActive = (id) => {
    navLinks.forEach((a) => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("is-active", href === `#${id}`);
    });
  };

  if ("IntersectionObserver" in window && sections.length) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0.1, 0.35, 0.6] }
    );
    sections.forEach((s) => io.observe(s));
  }

  const reveals = document.querySelectorAll(".reveal");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    reveals.forEach((el) => el.classList.add("is-visible"));
  } else if ("IntersectionObserver" in window) {
    const rio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            rio.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach((el) => rio.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-visible"));
  }

  const RELEASES_API = "https://api.github.com/repos/Haroon966/traylist/releases/latest";
  const RELEASES_PAGE = "https://github.com/Haroon966/traylist/releases/latest";

  const PLATFORM_LABELS = {
    windows: { eyebrow: "Windows", title: "Installer (.msi)" },
    linux: { eyebrow: "Ubuntu / Linux", title: "Package (.deb)" },
    "linux-appimage": { eyebrow: "Linux", title: "AppImage" },
    "mac-arm": { eyebrow: "macOS", title: "Apple Silicon (.dmg)" },
    "mac-intel": { eyebrow: "macOS", title: "Intel (.dmg)" },
    android: { eyebrow: "Android", title: "APK (arm64)" },
  };

  function pickAsset(assets, predicates) {
    for (const test of predicates) {
      const hit = assets.find((a) => test(a.name.toLowerCase()));
      if (hit) return hit;
    }
    return null;
  }

  function formatBytes(n) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function detectOsKey() {
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Android/i.test(ua)) return "android";
    if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(platform) || /Mac OS/i.test(ua)) return "mac-arm";
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) return "linux";
    return null;
  }

  function buildAssetMap(assets) {
    return {
      windows: pickAsset(assets, [
        (n) => n.includes("windows") && n.endsWith(".msi"),
        (n) => n.endsWith(".msi"),
        (n) => n.includes("windows") && n.endsWith(".exe"),
      ]),
      linux: pickAsset(assets, [
        (n) => n.includes("linux") && n.includes("amd64") && n.endsWith(".deb"),
        (n) => n.includes("ubuntu") && n.endsWith(".deb"),
        (n) => n.endsWith(".deb"),
      ]),
      "linux-appimage": pickAsset(assets, [
        (n) => n.includes("linux") && n.endsWith(".appimage"),
        (n) => n.endsWith(".appimage"),
      ]),
      "mac-arm": pickAsset(assets, [
        (n) => n.includes("aarch64") && n.endsWith(".dmg"),
        (n) => n.includes("darwin") && n.includes("aarch64") && n.endsWith(".dmg"),
        (n) => n.includes("macos") && (n.includes("arm") || n.includes("aarch")) && n.endsWith(".dmg"),
      ]),
      "mac-intel": pickAsset(assets, [
        (n) => n.includes("x64") && n.endsWith(".dmg"),
        (n) => n.includes("x86_64") && n.endsWith(".dmg"),
        (n) => n.includes("darwin") && n.includes("x64") && n.endsWith(".dmg"),
        (n) => n.endsWith(".dmg") && !n.includes("aarch64") && !n.includes("arm64"),
      ]),
      android: pickAsset(assets, [
        (n) => n.includes("android") && n.endsWith(".apk"),
        (n) => n.endsWith(".apk"),
      ]),
    };
  }

  function wireButton(btn, asset) {
    const meta = btn.querySelector("[data-dl-meta]");
    if (asset) {
      btn.setAttribute("href", asset.browser_download_url);
      btn.classList.remove("is-fallback");
      if (meta) {
        const size = formatBytes(asset.size);
        meta.textContent = size ? `${asset.name} · ${size}` : asset.name;
      }
    } else {
      btn.setAttribute("href", RELEASES_PAGE);
      btn.classList.add("is-fallback");
      if (meta && !meta.dataset.keep) meta.textContent = "Open on GitHub Releases";
    }
  }

  function fillAssetTable(assets) {
    const table = document.getElementById("dl-all-assets");
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;

    if (!assets.length) {
      tbody.innerHTML =
        '<tr><td colspan="3">No assets yet — <a href="' +
        RELEASES_PAGE +
        '" rel="noopener noreferrer">open GitHub Releases</a>.</td></tr>';
      return;
    }

    tbody.innerHTML = assets
      .map((a) => {
        const size = formatBytes(a.size) || "—";
        const name = String(a.name || "file").replace(/</g, "&lt;");
        const url = a.browser_download_url || RELEASES_PAGE;
        return (
          "<tr>" +
          `<td><code>${name}</code></td>` +
          `<td>${size}</td>` +
          `<td><a class="dl-table__btn" href="${url}" rel="noopener noreferrer" download>Download</a></td>` +
          "</tr>"
        );
      })
      .join("");
  }

  function wireRecommended(map, preferred) {
    const auto = document.querySelector('[data-dl="auto"]');
    if (!auto) return;

    const key = preferred || null;
    const asset = key ? map[key] : null;
    const label = key ? PLATFORM_LABELS[key] : null;

    if (label) {
      wireButton(auto, asset);
      const eyebrow = auto.querySelector(".dl-card__eyebrow");
      const title = auto.querySelector(".dl-card__title");
      if (eyebrow) eyebrow.textContent = `Recommended · ${label.eyebrow}`;
      if (title) title.textContent = asset ? `Download ${label.title}` : `Get ${label.title}`;
      auto.classList.add("is-recommended");
    } else {
      auto.setAttribute("href", RELEASES_PAGE);
      const eyebrow = auto.querySelector(".dl-card__eyebrow");
      const title = auto.querySelector(".dl-card__title");
      if (eyebrow) eyebrow.textContent = "All platforms";
      if (title) title.textContent = "Open latest release";
    }
  }

  function wireCopyButtons() {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.getAttribute("data-copy") || "";
        const label = btn.querySelector(".dl-copy__label");
        const prevAria = btn.getAttribute("aria-label") || "";
        try {
          await navigator.clipboard.writeText(text);
          btn.classList.add("is-copied");
          btn.setAttribute("aria-label", "Copied");
          if (label) label.textContent = "Copied";
          window.setTimeout(() => {
            btn.classList.remove("is-copied");
            if (prevAria) btn.setAttribute("aria-label", prevAria);
            if (label) label.textContent = "Copy";
          }, 1600);
        } catch {
          btn.setAttribute("aria-label", "Copy failed — select the command manually");
        }
      });
    });
  }

  async function wireDownloads() {
    const buttons = [...document.querySelectorAll("[data-dl]")];
    const versionEl = document.getElementById("download-version");
    const statusEl = document.getElementById("dl-status");
    if (!buttons.length && !document.getElementById("dl-all-assets")) return;

    let assets = [];
    let tag = "";
    try {
      const res = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      tag = data.tag_name || "";
      assets = Array.isArray(data.assets) ? data.assets : [];
    } catch {
      buttons.forEach((btn) => {
        btn.setAttribute("href", RELEASES_PAGE);
        btn.classList.add("is-fallback");
      });
      if (versionEl) {
        versionEl.hidden = false;
        versionEl.textContent = "Could not load release info — open GitHub Releases to download.";
      }
      if (statusEl) {
        statusEl.textContent = "Links fall back to the Releases page until assets are available.";
      }
      fillAssetTable([]);
      return;
    }

    const map = buildAssetMap(assets);

    buttons.forEach((btn) => {
      const key = btn.getAttribute("data-dl");
      if (!key || key === "auto") return;
      wireButton(btn, map[key] || null);
    });

    const preferred = detectOsKey();
    wireRecommended(map, preferred);

    if (preferred) {
      document.querySelectorAll(`[data-dl="${preferred}"]`).forEach((el) => {
        if (el.getAttribute("data-dl") !== "auto") el.classList.add("is-recommended");
      });
      if (preferred === "mac-arm") {
        document.querySelector('[data-dl="mac-intel"]')?.classList.remove("is-recommended");
      }
    }

    if (versionEl) {
      versionEl.hidden = false;
      versionEl.textContent = tag
        ? `Latest release: ${tag}`
        : "Latest release assets loaded from GitHub.";
    }

    const linked = Object.values(map).filter(Boolean).length;
    if (statusEl) {
      statusEl.textContent = assets.length
        ? `${assets.length} file${assets.length === 1 ? "" : "s"} · ${linked} platform link${linked === 1 ? "" : "s"} ready`
        : "No assets on the latest release yet — tag a version to publish installers.";
    }

    fillAssetTable(assets);
  }

  wireCopyButtons();
  void wireDownloads();
})();
