import { boot } from "./boot.js";
window.addEventListener("error", (e) => {
    console.error("[Global error]", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
    console.error("[Unhandled rejection]", e.reason);
});
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        void boot();
    });
}
else {
    void boot();
}
