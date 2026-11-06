import { expect, test } from "./helpers/appTest";
import type { Locator, Page } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, seedLocal } from "./helpers/localData";
import { readFileSync } from "node:fs";

const pageControlsCss = readFileSync(
  new URL("../src/components/ui/page-controls.css", import.meta.url),
  "utf8",
);

test.use({ reducedMotion: "reduce" });

async function checkControls(root: Locator, mobile: boolean) {
  const failures = await root
    .locator("button, a, input, select, summary")
    .evaluateAll((elements, mobile) => {
      return elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return [];
        const target = element.matches('input[type="checkbox"]')
          ? element.closest("label")!
          : element;
        const box = target.getBoundingClientRect();
        const style = getComputedStyle(element);
        const issues: string[] = [];
        if (box.width < 44 || box.height < 44)
          issues.push(`target ${box.width}x${box.height}`);
        if (
          mobile &&
          element.matches('input:not([type="checkbox"]), select') &&
          parseFloat(style.fontSize) < 16
        )
          issues.push(`font ${style.fontSize}`);
        if (
          element.matches(
            'input:not([type="checkbox"]), select, .primary-button, .secondary-button, .danger-button, .icon-button, .text-link, .overview-detail-action',
          ) &&
          style.borderRadius !== "12px"
        )
          issues.push(`radius ${style.borderRadius}`);
        return issues.length
          ? [{ element: element.outerHTML.slice(0, 150), issues }]
          : [];
      });
    }, mobile);
  expect(failures).toEqual([]);
}

async function focusByKeyboard(page: Page, control: Locator, accent: string) {
  await control.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-color", accent);
  await expect(control).toHaveCSS("outline-offset", "3px");
}

for (const theme of ["dark", "light"] as const) {
  test(`page controls keep readable fields, touch targets and keyboard focus in ${theme}`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await page.goto("/favicon.svg");
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const before = await rawLocal(page);
    const accent = theme === "dark" ? "rgb(177, 230, 197)" : "rgb(40, 116, 81)";
    const scope = page.locator(
      ".page-heading, .overview-details, .transactions-page, .settings-page",
    );
    for (const width of [320, 375, 639, 700, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/transacoes", "/configuracoes"]) {
        await page.evaluate((route) => {
          location.hash = route;
        }, route);
        const content = page.locator(
          route === "/"
            ? ".overview-details"
            : route === "/transacoes"
              ? ".transactions-page"
              : ".settings-page",
        );
        await expect(content).toBeVisible();
        if (route === "/configuracoes") {
          await content.locator("details").evaluateAll((details) =>
            details.forEach((detail) => {
              (detail as HTMLDetailsElement).open = true;
            }),
          );
        }
        await checkControls(scope, width <= 700);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          )
          .toBe(true);
        if (width === 375 || width === 1440) {
          await page.mouse.move(width - 10, 10);
          await page.screenshot({
            path: info.outputPath(
              `controls-${theme}-${route.replaceAll("/", "") || "overview"}-${width}.png`,
            ),
          });
        }
      }
      await page.evaluate(() => {
        location.hash = "/transacoes";
      });
      const panel = page.locator(".transactions-page");
      await expect(panel).toBeVisible();
      await panel
        .getByRole("button", { name: "Editar Gasto restaurado", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await checkControls(dialog, width <= 700);
      // A portal preserves the dialog subtree but mounts it outside the layout.
      // Restore its position before React unmounts it.
      const parent = await dialog.evaluateHandle(
        (element) => element.parentElement!,
      );
      const nextSibling = await dialog.evaluateHandle(
        (element) => element.nextSibling,
      );
      await dialog.evaluate((element) => document.body.append(element));
      try {
        expect(
          await dialog.evaluate(
            (element) => element.parentElement === document.body,
          ),
        ).toBe(true);
        await checkControls(dialog, width <= 700);
        await expect(dialog.locator(".amount-input")).toHaveCSS(
          "font-size",
          "28px",
        );
        await expect(dialog.locator(".primary-button")).toHaveCSS(
          "background-color",
          accent,
        );
        await focusByKeyboard(
          page,
          dialog.getByLabel("Descrição", { exact: true }),
          accent,
        );
      } finally {
        await dialog.evaluate(
          (element, { parent, nextSibling }) =>
            parent.insertBefore(element, nextSibling),
          { parent, nextSibling },
        );
        await parent.dispose();
        await nextSibling.dispose();
      }
      await expect(dialog.locator(".amount-input")).toHaveCSS(
        "font-size",
        "28px",
      );
      await focusByKeyboard(
        page,
        dialog.getByLabel("Descrição", { exact: true }),
        accent,
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
      location.hash = "/";
    });
    await expect(page.locator(".overview-details")).toBeVisible();
    const previous = page.getByRole("button", {
      name: "Mês anterior",
      exact: true,
    });
    await focusByKeyboard(page, previous, accent);
    await page.keyboard.press("Enter");
    await expect(page.locator(".month-selector")).toContainText(/agosto/i);
    await page
      .getByRole("button", { name: "Próximo mês", exact: true })
      .click();
    await expect(page.locator(".month-selector")).toContainText(/setembro/i);
    await page.evaluate(() => {
      location.hash = "/transacoes";
    });
    const panel = page.locator(".transactions-page");
    await expect(panel).toBeVisible();
    const importButton = panel.getByRole("button", {
      name: "Importar",
      exact: true,
    });
    const resting = await importButton.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await importButton.hover();
    await expect(importButton).not.toHaveCSS("background-color", resting);
    await focusByKeyboard(page, importButton, accent);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await checkControls(dialog, true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await panel.getByLabel("Buscar descrição").fill("Sem correspondência");
    const disabled = panel.getByRole("button", {
      name: "Exportar CSV",
      exact: true,
    });
    await expect(disabled).toBeDisabled();
    const disabledBackground = await disabled.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await disabled.hover({ force: true });
    await expect(disabled).toHaveCSS("background-color", disabledBackground);
    expect(await rawLocal(page)).toEqual(before);
  });
}

for (const theme of ["dark", "light"] as const) {
  test(`page controls do not style Sidebar, Bento or unrelated controls in ${theme}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await page.goto("/favicon.svg");
    await seedLocal(page, { ...backupFixture(), present: true });
    await page.goto("/");
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect(page.locator(".ab-root")).toBeVisible();
    await expect(page.locator(".vertice-sidebar")).toBeVisible();
    const leaks = await page.evaluate((css) => {
      const unrelated = document.createElement("section");
      unrelated.innerHTML =
        '<button class="primary-button">Unrelated</button><button class="secondary-button">Unrelated</button><button class="icon-button">Unrelated</button><input><select></select>';
      document.querySelector(".main-content")!.append(unrelated);
      const controls = Array.from(
        document.querySelectorAll("button, a, input, select, summary"),
      );
      const outsideScope = controls.filter(
        (element) =>
          !element.closest(
            ".page-heading, .welcome-panel, .overview-details, .transactions-page, .settings-page, .transaction-dialog, .demo-banner, .toast, .pwa-controls",
          ),
      );
      const leaks: string[] = [];
      function inspect(rules: CSSRuleList) {
        for (const rule of Array.from(rules)) {
          if (
            rule instanceof CSSStyleRule &&
            Array.from(rule.style).some(
              (property) => !property.startsWith("--"),
            )
          ) {
            // Check interactive states too, even when no control currently has focus.
            const selector = rule.selectorText.replace(
              /:(hover|focus-visible)/g,
              "",
            );
            for (const element of outsideScope) {
              if (element.matches(selector))
                leaks.push(
                  `${rule.selectorText}: ${element.outerHTML.slice(0, 150)}`,
                );
            }
          } else if ("cssRules" in rule)
            inspect((rule as CSSGroupingRule).cssRules);
        }
      }
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      inspect(sheet.cssRules);
      unrelated.remove();
      return leaks;
    }, pageControlsCss);
    expect(leaks).toEqual([]);
  });
}
