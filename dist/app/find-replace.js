// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2023-2026 Mark Yu
const MAX_MARKERS = 2000;
function isWordChar(ch) {
    return !!ch && /[A-Za-z0-9_]/.test(ch);
}
function isWholeWord(text, start, end) {
    const before = start > 0 ? text[start - 1] : undefined;
    const after = end < text.length ? text[end] : undefined;
    return !isWordChar(before) && !isWordChar(after);
}
function escapeRegex(query) {
    return query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function createFindReplaceController(dom, editor, refocusEditor) {
    let matches = [];
    let activeMatchIndex = -1;
    let markers = [];
    let invalidRegex = false;
    function getFocusedFindField() {
        const active = document.activeElement;
        if (active === dom.findInput)
            return dom.findInput;
        if (active === dom.replaceInput)
            return dom.replaceInput;
        return null;
    }
    function isFindOpen() {
        return dom.findBar.classList.contains("active");
    }
    function isReplaceMode() {
        return dom.findBar.classList.contains("replaceMode");
    }
    function setReplaceMode(enabled) {
        dom.findBar.classList.toggle("replaceMode", enabled);
        dom.findReplaceModeBtn.setAttribute("aria-pressed", String(enabled));
        dom.findReplaceModeBtn.textContent = enabled ? "Hide Replace" : "Replace";
    }
    function setStatus(message, isError = false) {
        dom.findStatus.textContent = message;
        dom.findStatus.classList.toggle("error", isError);
    }
    function clearMarkers() {
        markers.forEach((marker) => marker.clear());
        markers = [];
    }
    function getRegex(useGlobal) {
        const query = dom.findInput.value;
        if (!query)
            return null;
        const flags = `${dom.findCaseToggle.checked ? "" : "i"}${useGlobal ? "g" : ""}`;
        const source = dom.findRegexToggle.checked ? query : escapeRegex(query);
        try {
            return new RegExp(source, flags);
        }
        catch {
            return null;
        }
    }
    function buildMatches() {
        const query = dom.findInput.value;
        const text = editor.getValue();
        invalidRegex = false;
        if (!query)
            return [];
        if (dom.findRegexToggle.checked) {
            const regex = getRegex(true);
            if (!regex) {
                invalidRegex = true;
                return [];
            }
            const out = [];
            let match;
            while ((match = regex.exec(text))) {
                const matched = match[0];
                const start = match.index;
                const end = start + matched.length;
                if (!matched.length) {
                    regex.lastIndex += 1;
                    continue;
                }
                if (dom.findWordToggle.checked && !isWholeWord(text, start, end))
                    continue;
                out.push({ start, end, text: matched });
            }
            return out;
        }
        const needle = dom.findCaseToggle.checked ? query : query.toLowerCase();
        const haystack = dom.findCaseToggle.checked ? text : text.toLowerCase();
        const out = [];
        let from = 0;
        while (from <= haystack.length - needle.length) {
            const index = haystack.indexOf(needle, from);
            if (index < 0)
                break;
            const end = index + needle.length;
            if (!dom.findWordToggle.checked || isWholeWord(text, index, end)) {
                out.push({ start: index, end, text: text.slice(index, end) });
            }
            from = index + Math.max(needle.length, 1);
        }
        return out;
    }
    function nextIndexFromCursor(reverse) {
        if (!matches.length)
            return -1;
        const cursor = editor.getCursor(reverse ? "from" : "to");
        const cursorIndex = editor.indexFromPos(cursor);
        if (reverse) {
            for (let i = matches.length - 1; i >= 0; i -= 1) {
                if (matches[i].end < cursorIndex)
                    return i;
            }
            return matches.length - 1;
        }
        for (let i = 0; i < matches.length; i += 1) {
            if (matches[i].start > cursorIndex)
                return i;
        }
        return 0;
    }
    function highlightMatches() {
        clearMarkers();
        if (!matches.length)
            return;
        const limit = Math.min(matches.length, MAX_MARKERS);
        for (let i = 0; i < limit; i += 1) {
            const match = matches[i];
            const from = editor.posFromIndex(match.start);
            const to = editor.posFromIndex(match.end);
            const marker = editor.markText(from, to, {
                className: i === activeMatchIndex ? "cm-searching cm-searching-active" : "cm-searching"
            });
            markers.push(marker);
        }
    }
    function syncUiState() {
        const hasQuery = !!dom.findInput.value;
        const hasMatches = matches.length > 0;
        const activeLabel = hasMatches && activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0;
        dom.findCount.textContent = hasQuery ? `${activeLabel} / ${matches.length}` : "0 / 0";
        dom.findPrevBtn.disabled = !hasMatches;
        dom.findNextBtn.disabled = !hasMatches;
        dom.replaceBtn.disabled = !hasMatches;
        dom.replaceAllBtn.disabled = !hasMatches;
    }
    function selectMatch(index) {
        if (index < 0 || index >= matches.length)
            return;
        activeMatchIndex = index;
        const match = matches[index];
        const from = editor.posFromIndex(match.start);
        const to = editor.posFromIndex(match.end);
        editor.setSelection(from, to);
        editor.scrollIntoView({ from, to }, 80);
        highlightMatches();
        syncUiState();
    }
    function refreshMatches(selectClosest = true) {
        const focusedField = getFocusedFindField();
        matches = buildMatches();
        if (!dom.findInput.value) {
            activeMatchIndex = -1;
            clearMarkers();
            setStatus("");
            syncUiState();
            return;
        }
        if (invalidRegex) {
            activeMatchIndex = -1;
            clearMarkers();
            setStatus("Invalid regular expression.", true);
            syncUiState();
            return;
        }
        if (!matches.length) {
            activeMatchIndex = -1;
            clearMarkers();
            setStatus("No matches.");
            syncUiState();
            return;
        }
        if (activeMatchIndex < 0 || activeMatchIndex >= matches.length) {
            activeMatchIndex = 0;
        }
        setStatus(`${matches.length} match${matches.length === 1 ? "" : "es"}.`);
        if (selectClosest) {
            selectMatch(nextIndexFromCursor(false));
        }
        else {
            highlightMatches();
            syncUiState();
        }
        if (focusedField) {
            requestAnimationFrame(() => focusedField.focus());
        }
    }
    function findNext(reverse = false) {
        if (!matches.length) {
            refreshMatches(false);
            if (!matches.length)
                return;
        }
        const focusedField = getFocusedFindField();
        selectMatch(nextIndexFromCursor(reverse));
        if (focusedField) {
            requestAnimationFrame(() => focusedField.focus());
        }
    }
    function getReplacementText(matchText) {
        if (!dom.findRegexToggle.checked)
            return dom.replaceInput.value;
        const regex = getRegex(false);
        if (!regex)
            return dom.replaceInput.value;
        return matchText.replace(regex, dom.replaceInput.value);
    }
    function replaceCurrent() {
        if (!matches.length || activeMatchIndex < 0) {
            findNext(false);
            if (!matches.length || activeMatchIndex < 0)
                return;
        }
        const focusedField = getFocusedFindField();
        const match = matches[activeMatchIndex];
        const replacement = getReplacementText(match.text);
        const from = editor.posFromIndex(match.start);
        const to = editor.posFromIndex(match.end);
        editor.replaceRange(replacement, from, to, "+replace");
        const cursor = editor.posFromIndex(match.start + replacement.length);
        editor.setSelection(cursor, cursor);
        refreshMatches(true);
        setStatus("Replaced 1 match.");
        if (focusedField) {
            requestAnimationFrame(() => focusedField.focus());
        }
    }
    function replaceAll() {
        if (!matches.length)
            return;
        const focusedField = getFocusedFindField();
        const toReplace = [...matches];
        for (let i = toReplace.length - 1; i >= 0; i -= 1) {
            const match = toReplace[i];
            const replacement = getReplacementText(match.text);
            const from = editor.posFromIndex(match.start);
            const to = editor.posFromIndex(match.end);
            editor.replaceRange(replacement, from, to, "+replace");
        }
        refreshMatches(true);
        setStatus(`Replaced ${toReplace.length} match${toReplace.length === 1 ? "" : "es"}.`);
        if (focusedField) {
            requestAnimationFrame(() => focusedField.focus());
        }
    }
    function openFind() {
        dom.findBar.classList.add("active");
        setReplaceMode(false);
        dom.findBtn.classList.add("active");
        if (!dom.findInput.value && editor.somethingSelected()) {
            const selected = editor.getSelection();
            if (selected && !selected.includes("\n")) {
                dom.findInput.value = selected;
            }
        }
        refreshMatches(true);
        requestAnimationFrame(() => {
            dom.findInput.focus();
            dom.findInput.select();
        });
    }
    function openReplace() {
        dom.findBar.classList.add("active");
        setReplaceMode(true);
        dom.findBtn.classList.add("active");
        if (!dom.findInput.value && editor.somethingSelected()) {
            const selected = editor.getSelection();
            if (selected && !selected.includes("\n")) {
                dom.findInput.value = selected;
            }
        }
        refreshMatches(true);
        requestAnimationFrame(() => {
            dom.findInput.focus();
            dom.findInput.select();
        });
    }
    function closeFind() {
        dom.findBar.classList.remove("active");
        setReplaceMode(false);
        dom.findBtn.classList.remove("active");
        clearMarkers();
        matches = [];
        activeMatchIndex = -1;
        setStatus("");
        syncUiState();
        refocusEditor();
    }
    dom.findInput.addEventListener("input", () => {
        refreshMatches(true);
    });
    dom.findCaseToggle.addEventListener("change", () => {
        refreshMatches(true);
    });
    dom.findWordToggle.addEventListener("change", () => {
        refreshMatches(true);
    });
    dom.findRegexToggle.addEventListener("change", () => {
        refreshMatches(true);
    });
    dom.findPrevBtn.addEventListener("click", () => {
        findNext(true);
    });
    dom.findNextBtn.addEventListener("click", () => {
        findNext(false);
    });
    dom.findCloseBtn.addEventListener("click", closeFind);
    dom.findReplaceModeBtn.addEventListener("click", () => {
        const next = !isReplaceMode();
        setReplaceMode(next);
        if (next) {
            requestAnimationFrame(() => {
                dom.replaceInput.focus();
                dom.replaceInput.select();
            });
        }
        else {
            requestAnimationFrame(() => {
                dom.findInput.focus();
                dom.findInput.select();
            });
        }
    });
    dom.replaceBtn.addEventListener("click", replaceCurrent);
    dom.replaceAllBtn.addEventListener("click", replaceAll);
    dom.findInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            findNext(!!e.shiftKey);
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            closeFind();
        }
    });
    dom.replaceInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey)
                replaceAll();
            else
                replaceCurrent();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            closeFind();
        }
    });
    window.addEventListener("keydown", (e) => {
        const mod = e.metaKey || e.ctrlKey;
        const key = e.key.toLowerCase();
        if (mod && !e.altKey && !e.shiftKey && key === "f") {
            e.preventDefault();
            e.stopImmediatePropagation();
            openFind();
            return;
        }
        if (mod && !e.altKey && !e.shiftKey && key === "h") {
            e.preventDefault();
            e.stopImmediatePropagation();
            openReplace();
            return;
        }
        if (!isFindOpen())
            return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeFind();
            return;
        }
        if (e.key === "F3") {
            e.preventDefault();
            e.stopImmediatePropagation();
            findNext(!!e.shiftKey);
        }
    }, true);
    editor.on("change", () => {
        if (!isFindOpen())
            return;
        refreshMatches(false);
    });
    dom.findBtn.addEventListener("click", () => {
        if (isFindOpen() && !isReplaceMode())
            closeFind();
        else
            openFind();
    });
    syncUiState();
    return {
        openFind,
        openReplace,
        closeFind
    };
}
