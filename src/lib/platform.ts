/** True on Android devices, or browser redesign via `?mobile=1` / `#mobile`. */
export function isAndroidUa(): boolean {
  if (typeof window === "undefined") return false;
  if (/Android/i.test(navigator.userAgent)) return true;
  return isMobilePreview();
}

/** Browser-only mobile redesign (not a real Android device). */
export function isMobilePreview(): boolean {
  if (typeof window === "undefined") return false;
  if (/Android/i.test(navigator.userAgent)) return false;
  if (isWidgetPreview()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mobile") === "1" || params.get("mobile") === "true") return true;
  if (window.location.hash === "#mobile") return true;
  return localStorage.getItem("traylist.mobilePreview") === "1";
}

/** Browser-only home-widget redesign (`?widget=1` / `#widget`). */
export function isWidgetPreview(): boolean {
  if (typeof window === "undefined") return false;
  if (/Android/i.test(navigator.userAgent)) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("widget") === "1" || params.get("widget") === "true") return true;
  if (window.location.hash === "#widget") return true;
  return localStorage.getItem("traylist.widgetPreview") === "1";
}
