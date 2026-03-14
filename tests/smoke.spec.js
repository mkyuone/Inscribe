const { test, expect } = require("@playwright/test");

async function waitForEditorSurface(page) {
  await page.locator("#loadingOverlay.hidden").waitFor({ state: "attached" });
  await page.locator(".CodeMirror").waitFor();
}

async function waitForEditor(page) {
  await page.goto("/");
  await waitForEditorSurface(page);
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

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  await page.click("#historyRestoreBtn");
  await expect
    .poll(() => dialogMessage.includes("Restore this snapshot?"))
    .toBeTruthy();
});
