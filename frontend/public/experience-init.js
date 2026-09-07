(function () {
  try {
    var locale = localStorage.getItem("efop.locale") || "en";
    var theme = localStorage.getItem("efop.theme") || "system";
    var root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    var dark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
  } catch (_) {}
})();
