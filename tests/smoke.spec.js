const { test, expect } = require("@playwright/test");

async function waitForEditorSurface(page) {
  await page.locator("#loadingOverlay.hidden").waitFor({ state: "attached" });
  await page.locator(".CodeMirror").waitFor();
}

async function waitForEditor(page) {
  await page.goto("/");
  await waitForEditorSurface(page);
}

async function enableWorkspaceFeature(page) {
  if (await page.locator("#workspaceToggleBtn").isVisible()) {
    return;
  }

  await page.click("#moreBtn");
  await page.click("#settingsBtn");
  await page.click("#workspaceFeatureToggle");
  await expect(page.locator("#confirmOverlay")).toHaveClass(/active/);
  await expect(page.locator("#confirmText")).toContainText("Workspace projects are still under development.");
  await page.click("#confirmOkBtn");
  await expect(page.locator("#workspaceToggleBtn")).toBeVisible();
  await expect(page.locator("#workspacePane")).toBeVisible();
  await page.click("#closeSettingsBtn");
}

async function showWorkspace(page) {
  await enableWorkspaceFeature(page);

  if (!(await page.locator("#workspacePane").isVisible())) {
    await page.click("#workspaceToggleBtn");
  }
  await expect(page.locator("#workspacePane")).toBeVisible();
}

async function setEditorValue(page, value) {
  await page.evaluate((nextValue) => {
    const cmElement = document.querySelector(".CodeMirror");
    if (!cmElement || !cmElement.CodeMirror) {
      throw new Error("CodeMirror instance not found.");
    }
    cmElement.CodeMirror.setValue(nextValue);
    cmElement.CodeMirror.focus();
  }, value);
}

async function getEditorValue(page) {
  return page.evaluate(() => {
    const cmElement = document.querySelector(".CodeMirror");
    if (!cmElement || !cmElement.CodeMirror) {
      throw new Error("CodeMirror instance not found.");
    }
    return cmElement.CodeMirror.getValue();
  });
}

async function waitForPyodideReady(page) {
  await expect(page.locator("#console")).toContainText("Inscribe Editor & Execution with Pyodide", {
    timeout: 30000
  });
}

test("loads with startup banner and active-line highlight", async ({ page }) => {
  const consoleMessages = [];
  page.on("console", (msg) => {
    consoleMessages.push(msg.text());
  });

  await waitForEditor(page);
  await expect(page.locator("#workspacePane")).toBeHidden();
  await expect(page.locator("#workspaceToggleBtn")).toBeHidden();

  const activeLine = page.locator(".CodeMirror-activeline-background");
  await expect(activeLine).toHaveCount(1);
  await expect(activeLine).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(() => consoleMessages.some((msg) => /Inscribe v\d+\.\d+ \/ \(c\) Mark Yu/.test(msg)))
    .toBeTruthy();

  await page.evaluate(() => {
    const cmElement = document.querySelector(".CodeMirror");
    if (!cmElement || !cmElement.CodeMirror) {
      throw new Error("CodeMirror instance not found.");
    }
    cmElement.CodeMirror.setValue("alpha\nbeta\n");
    cmElement.CodeMirror.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
    cmElement.CodeMirror.focus();
  });
  await expect(activeLine).toHaveCount(0);
  await page.locator(".CodeMirror").click();
  await expect(activeLine).toHaveCount(1);

  await page.click("#moreBtn");
  await page.click("#settingsBtn");
  await expect(page.locator("#settingsOverlay")).toHaveClass(/active/);
  await page.click("#workspaceFeatureToggle");
  await expect(page.locator("#confirmOverlay")).toHaveClass(/active/);
  await page.click("#confirmOkBtn");
  await expect(page.locator("#workspaceToggleBtn")).toBeVisible();
  await expect(page.locator("#workspacePane")).toBeVisible();
  await page.click("#activeLineToggle");
  await expect(page.locator("html")).toHaveAttribute("data-active-line", "off");
  await page.click("#closeSettingsBtn");
  await page.evaluate(() => {
    const cmElement = document.querySelector(".CodeMirror");
    if (!cmElement || !cmElement.CodeMirror) {
      throw new Error("CodeMirror instance not found.");
    }
    cmElement.CodeMirror.focus();
  });
  await expect(activeLine).toHaveCount(1);
  await expect(activeLine).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(activeLine).toHaveCSS("box-shadow", "none");
});

test("restores multi-tab session after reload", async ({ page }) => {
  await waitForEditor(page);

  await setEditorValue(page, "first = 1\n");
  await page.click("#newTabBtn");
  await setEditorValue(page, "second = 2\n");

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.reload();
  await waitForEditorSurface(page);

  await expect(page.locator(".tabItem")).toHaveCount(2);
  await expect(page.locator(".tabItem.active .tabName")).toHaveText("untitled-2.py");
  await expect.poll(() => getEditorValue(page)).toBe("second = 2\n");

  await page.locator('.tabItem [data-action="select"]').first().click();
  await expect.poll(() => getEditorValue(page)).toBe("first = 1\n");
});

test("menus stay above toasts", async ({ page }) => {
  await waitForEditor(page);
  await setEditorValue(page, "");

  await page.click("#shareBtn");
  await expect(page.locator("#shareToast.show")).toBeVisible();

  await page.click("#moreBtn");
  await expect(page.locator("#moreMenu.active")).toBeVisible();

  const topElementInfo = await page.locator("#moreMenu").evaluate((menu) => {
    const rect = menu.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + Math.min(24, rect.height / 2);
    const topEl = document.elementFromPoint(x, y);
    return {
      topId: topEl ? topEl.id : null,
      topTag: topEl ? topEl.tagName : null,
      topClass: topEl ? topEl.className : null,
      insideMenu: !!topEl && (topEl === menu || menu.contains(topEl))
    };
  });

  expect(topElementInfo, JSON.stringify(topElementInfo)).toMatchObject({ insideMenu: true });
});

test("variables panel shows user variables only", async ({ page }) => {
  await waitForEditor(page);
  await waitForPyodideReady(page);

  await setEditorValue(page, "x = 1\ny = [1, 2, 3]\n");
  await page.click("#runBtn");

  await expect(page.locator("#varsList")).toContainText("x", { timeout: 30000 });
  await expect(page.locator("#varsList")).toContainText("y", { timeout: 30000 });
  await expect(page.locator("#varsList")).not.toContainText("custom_input");
  await expect(page.locator("#varsList")).not.toContainText("JSConsole");
});

test("history restore asks for confirmation", async ({ page }) => {
  await waitForEditor(page);
  await waitForPyodideReady(page);

  await setEditorValue(page, "value = 1\n");
  await page.click("#runBtn");

  await setEditorValue(page, "value = 2\n");
  await page.click("#moreBtn");
  await page.click("#historyBtn");

  await expect(page.locator(".historyItem")).toHaveCount(1, { timeout: 30000 });
  await page.click(".historyItem");
  await page.click("#historyRestoreBtn");
  await expect(page.locator("#confirmOverlay")).toHaveClass(/active/);
  await expect(page.locator("#confirmTitle")).toHaveText("Restore Snapshot?");
  await expect(page.locator("#confirmText")).toContainText("current editor contents will be replaced");
  await page.click("#confirmCancelBtn");
  await expect(page.locator("#confirmOverlay")).not.toHaveClass(/active/);
});

test("runs active file with workspace imports and generated files", async ({ page }) => {
  await waitForEditor(page);
  await waitForPyodideReady(page);
  await showWorkspace(page);

  await page.setInputFiles("#fileInput", [
    {
      name: "main.py",
      mimeType: "text/x-python",
      buffer: Buffer.from(
        "from pathlib import Path\n" +
          "from helper import double\n" +
          "import json\n\n" +
          "here = Path(__file__)\n" +
          "Path('artifacts').mkdir(exist_ok=True)\n" +
          "Path('artifacts/result.json').write_text(json.dumps({'file': here.name, 'value': double(3)}), encoding='utf-8')\n" +
          "print(here.name)\n" +
          "print(double(3))\n"
      )
    },
    {
      name: "helper.py",
      mimeType: "text/x-python",
      buffer: Buffer.from("def double(x):\n    return x * 2\n")
    }
  ]);

  await page.locator('.workspaceFile .workspaceLabel', { hasText: "main.py" }).click();
  await page.click("#runBtn");
  await expect(page.locator("#console")).toContainText("main.py", { timeout: 30000 });
  await expect(page.locator("#console")).toContainText("6", { timeout: 30000 });
  await expect(page.locator("#sysToast")).toContainText("Workspace updated", { timeout: 30000 });

  await page.locator('.workspaceFile .workspaceLabel', { hasText: "result.json" }).click();
  await expect(page.locator("#filePreviewPane")).toBeVisible();
  await expect(page.locator("#filePreviewBody")).toContainText("Object");
  await expect(page.locator("#filePreviewBody")).toContainText("file");
  await expect(page.locator("#filePreviewBody")).toContainText("main.py");
  await expect(page.locator("#filePreviewBody")).toContainText("value");
  await expect(page.locator("#filePreviewBody")).toContainText("6");
});

test("shows formatted preview for JSON workspace files", async ({ page }) => {
  await waitForEditor(page);
  await showWorkspace(page);

  await page.setInputFiles("#fileInput", [
    {
      name: "data.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"alpha":1,"beta":[2,3]}')
    }
  ]);

  await expect(page.locator("#filePreviewPane")).toBeVisible();
  await expect(page.locator("#filePreviewBody")).toContainText("Object");
  await expect(page.locator("#filePreviewBody")).toContainText("alpha");
  await expect(page.locator("#filePreviewBody")).toContainText("1");
  await expect(page.locator("#filePreviewBody")).toContainText("beta");
});

test("recovers from MemoryError on the next run", async ({ page }) => {
  await waitForEditor(page);
  await waitForPyodideReady(page);

  await setEditorValue(page, "raise MemoryError('boom')\n");
  await page.click("#runBtn");

  await expect(page.locator("#console")).toContainText("Finished with errors.", { timeout: 30000 });
  await expect(page.locator("#console")).toContainText(
    "Pyodide ran out of memory and was restarted. Run again to continue.",
    { timeout: 30000 }
  );
  await expect(page.locator("#varsList")).toContainText("No user variables yet.");

  await setEditorValue(page, "value = 42\nprint(value)\n");
  await page.click("#runBtn");

  await expect(page.locator("#console")).toContainText("42", { timeout: 30000 });
  await expect(page.locator("#varsList")).toContainText("value", { timeout: 30000 });
});

test("workspace upload modal opens and file rows rename inline", async ({ page }) => {
  await waitForEditor(page);
  await showWorkspace(page);

  await page.click("#workspaceUploadBtn");
  await expect(page.locator("#workspaceUploadOverlay")).toHaveClass(/active/);
  await page.click("#workspaceUploadCancelBtn");
  await expect(page.locator("#workspaceUploadOverlay")).not.toHaveClass(/active/);

  await page.setInputFiles("#fileInput", [
    {
      name: "notes.py",
      mimeType: "text/x-python",
      buffer: Buffer.from("print('notes')\n")
    }
  ]);

  await page.locator('.workspaceFile .workspaceLabel', { hasText: "notes.py" }).dblclick();
  const renameInput = page.locator('.workspaceRenameInput[data-tab-id]');
  await expect(renameInput).toBeVisible();
  await renameInput.fill("renamed.py");
  await renameInput.press("Enter");

  await expect(page.locator('.workspaceFile .workspaceLabel', { hasText: "renamed.py" })).toBeVisible();
  await expect(page.locator(".tabName", { hasText: "renamed.py" })).toBeVisible();

  await page.click("#workspaceRenameBtn");
  await expect(renameInput).toBeVisible();
  await renameInput.fill("renamed-again.py");
  await renameInput.press("Enter");

  await expect(page.locator('.workspaceFile .workspaceLabel', { hasText: "renamed-again.py" })).toBeVisible();
  await expect(page.locator(".tabName", { hasText: "renamed-again.py" })).toBeVisible();
});

test("workspace removal uses a custom warning modal", async ({ page }) => {
  await waitForEditor(page);
  await showWorkspace(page);

  await page.setInputFiles("#fileInput", [
    {
      name: "delete-me.py",
      mimeType: "text/x-python",
      buffer: Buffer.from("print('bye')\n")
    }
  ]);

  await page.locator('.workspaceFile .workspaceLabel', { hasText: "delete-me.py" }).click();
  await page.click("#workspaceDeleteBtn");

  await expect(page.locator("#workspaceRemoveOverlay")).toHaveClass(/active/);
  await expect(page.locator("#workspaceRemoveText")).toContainText("delete-me.py");

  await page.click("#workspaceRemoveCancelBtn");
  await expect(page.locator("#workspaceRemoveOverlay")).not.toHaveClass(/active/);
  await expect(page.locator('.workspaceFile .workspaceLabel', { hasText: "delete-me.py" })).toBeVisible();

  await page.click("#workspaceDeleteBtn");
  await page.click("#workspaceRemoveConfirmBtn");
  await expect(page.locator('.workspaceFile .workspaceLabel', { hasText: "delete-me.py" })).toHaveCount(0);
});

test("share link copies a working URL", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await waitForEditor(page);

  await setEditorValue(page, "print('shared link works')\n");
  await page.click("#shareBtn");
  await expect(page.locator("#shareToast")).toContainText("Share link copied", { timeout: 30000 });

  const sharedUrl = await page.evaluate(async () => navigator.clipboard.readText());
  expect(sharedUrl).toContain("#");

  const verifyContext = await browser.newContext();
  const verifyPage = await verifyContext.newPage();
  await verifyPage.goto(sharedUrl);
  await waitForEditorSurface(verifyPage);
  await expect.poll(() => getEditorValue(verifyPage)).toBe("print('shared link works')\n");
  await expect(verifyPage.locator("#shareToast")).toContainText("Shared code loaded", {
    timeout: 30000
  });
  await verifyContext.close();
});
