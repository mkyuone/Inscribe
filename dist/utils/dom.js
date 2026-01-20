export function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`Missing element: ${id}`);
    return el;
}
export function debounce(fn, delay = 200) {
    let t = null;
    return (...args) => {
        if (t)
            clearTimeout(t);
        t = setTimeout(() => fn(...args), delay);
    };
}
export function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
export function setClass(el, status) {
    el.classList.remove("good", "warn", "bad");
    el.classList.add(status);
}
