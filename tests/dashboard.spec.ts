import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import type { FinanceSettings } from "../src/types/finance";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
});
async function add(
  page: Page,
  description: string,
  amount: string,
  type = "Gasto",
  date?: string,
) {
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: type, exact: true }).click();
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill(amount);
  await dialog.getByLabel("Descrição", { exact: true }).fill(description);
  if (date) await dialog.getByLabel("Data", { exact: true }).fill(date);
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
}

test("distingue banco vazio de mês sem registros e restaura vazio após excluir", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await expect(page.locator(".primary-metric")).toHaveCount(0);
  await add(page, "Único lançamento", "100", "Receita");
  await page.getByRole("button", { name: "Mês anterior", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum lançamento neste mês" }),
  ).toBeVisible();
  await expect(page.locator(".primary-metric")).toHaveCount(0);
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page.getByRole("button", { name: "Excluir Único lançamento" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await page.reload();
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await expect(page.locator(".primary-metric")).toHaveCount(0);
});

test("data inicial futura no rascunho mostra saldo indisponível sem persistir", async ({
  page,
}) => {
  await page.goto("/#/configuracoes");
  const date = page.getByLabel("Data do saldo inicial").first();
  await expect(date).toHaveValue("1900-01-01");
  await date.fill("2026-09-16");
  const note = page.locator(".settings-record .form-note").first();
  await expect(note).toContainText("Saldo indisponível para este período");
  await expect(note).not.toContainText("R$");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await page.reload();
  await expect(date).toHaveValue("1900-01-01");
  await expect(note).toContainText("0,00");
});

for (const operation of ["cadastro", "importação"] as const) {
  test(`erro do repository chega à ${operation} e preserva os dados`, async ({
    page,
  }) => {
    await page.goto("/");
    await add(page, "Receita preservada", "500", "Receita");
    if (operation === "cadastro") {
      await page
        .getByRole("button", { name: "Adicionar transação", exact: true })
        .filter({ visible: true })
        .click();
      await page.getByLabel("Valor (R$)", { exact: true }).fill("100");
      await page
        .getByLabel("Descrição", { exact: true })
        .fill("Gasto pendente");
    } else {
      await page.getByRole("link", { name: "Transações", exact: true }).click();
      await page.getByRole("button", { name: "Importar", exact: true }).click();
      await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
        name: "erro.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Descrição;Valor;Data\nGasto pendente;-100;10/09/2026",
        ),
      });
      await expect(
        page.getByRole("button", { name: "Importar 1 transações" }),
      ).toBeEnabled();
    }
    // Simulate another writer changing settings after the form/preview captured its snapshot.
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 3);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("settings", "readwrite");
          const store = tx.objectStore("settings");
          const read = store.get("personal");
          read.onsuccess = () => {
            const settings = read.result as FinanceSettings;
            settings.categories = settings.categories.map((c) =>
              c.type === "expense" ? { ...c, id: `new-${c.id}` } : c,
            );
            store.put(settings, "personal");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    });
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name:
          operation === "cadastro"
            ? "Salvar transação"
            : "Importar 1 transações",
      })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "categoria compatível",
    );
    if (operation === "cadastro")
      await expect(dialog.getByLabel("Descrição", { exact: true })).toHaveValue(
        "Gasto pendente",
      );
    else
      await expect(
        dialog.getByText("Gasto pendente", { exact: true }),
      ).toBeVisible();
    await page.goto("/");
    await expect(page.locator(".primary-metric h2")).toContainText("500,00");
    await expect(page.getByText("Gasto pendente", { exact: true })).toHaveCount(
      0,
    );
  });
}
test("cadastro, edição, exclusão, transferência e persistência", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seu dashboard começa aqui." }),
  ).toBeVisible();
  await add(page, "Salário", "4.500,00", "Receita");
  await expect(page.locator(".primary-metric h2")).toContainText("4.500,00");
  await add(page, "Transporte diário", "85,00");
  await expect(page.locator(".primary-metric h2")).toContainText("4.415,00");
  await add(page, "Reserva do mês", "300", "Transferência");
  await expect(page.locator(".primary-metric h2")).toContainText("4.415,00");
  await page.reload();
  await expect(page.locator(".primary-metric h2")).toContainText("4.415,00");
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar Transporte diário", exact: true })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("100,50");
  await page.getByRole("button", { name: "Salvar transação" }).click();
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("4.399,50");
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page.getByRole("button", { name: "Excluir Transporte diário" }).click();
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("4.500,00");
  expect(errors).toEqual([]);
});
test("importação CSV com prévia, correção de erros e duplicatas", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "movimentos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Descrição;Valor;Data\nUber;-32,00;10/09/2026\nSalário;4500;01/09/2026\nInválida;10;31/02/2026",
    ),
  });
  await expect(
    dialog.getByRole("button", { name: "Importar 3 transações" }),
  ).toBeDisabled();
  await dialog.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "movimentos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Descrição;Valor;Data\nUber;-32,00;10/09/2026\nSalário;4500;01/09/2026\nUber;-32,00;10/09/2026",
    ),
  });
  await dialog.getByRole("button", { name: "Importar 2 transações" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "2 transações importadas",
  );
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("4.468,00");
  await page.reload();
  await expect(page.locator(".primary-metric h2")).toContainText("4.468,00");
});
test("importação XLSX com data e valor numéricos", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Extrato");
  sheet.addRow(["Data", "Descrição", "Valor"]);
  sheet.addRow([new Date("2026-09-10T12:00:00Z"), "Mercado XLSX", -184.5]);
  sheet.getCell("A2").numFmt = "dd/mm/yyyy";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await page.goto("/");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "extrato.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await page.getByRole("button", { name: "Importar 1 transações" }).click();
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.locator(".primary-metric h2")).toContainText("184,50");
  await expect(page.getByText("Mercado XLSX", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("configuração persiste saldo inicial e orçamento, sem alterar resultado mensal", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Configurar contas" }).click();
  await page
    .getByLabel("Saldo inicial (R$)", { exact: true })
    .first()
    .fill("1000");
  await page.getByLabel("Data do saldo inicial").first().fill("2026-09-01");
  await page.getByLabel("Limite mensal (R$)").first().fill("100");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByRole("status")).toContainText("Configurações salvas");
  await page.reload();
  await expect(
    page.getByLabel("Saldo inicial (R$)", { exact: true }).first(),
  ).toHaveValue("1000");
  await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
  await add(page, "Alimentação teste", "85");
  await expect(page.locator(".primary-metric h2")).toContainText("85,00");
  await expect(page.getByText("Alimentação: perto do limite")).toBeVisible();
  await page.locator(".accounts-overview summary").click();
  await expect(page.locator(".account-grid")).toContainText("915,00");
});
test("migração v1 preserva dados reais e remove apenas demonstração após confirmação", async ({
  page,
}) => {
  await page.goto("/favicon.svg");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("vertice-finance", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("transactions", {
          keyPath: "id",
        });
        store.add({
          id: "demo-0-0",
          type: "income",
          amount: 1000,
          category: "income",
          account: "principal",
          description: "Salário demonstrativo",
          date: "2026-09-01",
          recurring: true,
        });
        store.add({
          id: "real-existing",
          type: "expense",
          amount: 85,
          category: "food",
          account: "principal",
          description: "Meu gasto real",
          date: "2026-09-10",
          recurring: false,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.goto("/");
  await expect(page.locator(".primary-metric h2")).toContainText("915,00");
  await page
    .getByRole("button", { name: "Remover demonstração", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remover demonstração", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Meu gasto real", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Salário demonstrativo", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".primary-metric h2")).toContainText("85,00");
});
test("outra aba recebe alterações sem recarregar", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Seu dashboard começa aqui." }),
  ).toBeVisible();
  await add(page, "Receita entre abas", "500", "Receita");
  await expect(other.locator(".primary-metric h2")).toContainText("500,00");
  await other.close();
});
test("falha de gravação mantém formulário e não altera saldo", async ({
  page,
}) => {
  await page.goto("/");
  await add(page, "Receita inicial", "500", "Receita");
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "transactions")
        throw new DOMException("Falha simulada", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("100");
  await page.getByLabel("Descrição", { exact: true }).fill("Falha teste");
  await page.getByRole("button", { name: "Salvar transação" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Falha teste",
  );
  await expect(page.locator(".primary-metric h2")).toContainText("500,00");
});
for (const operation of ["exclusão", "remoção demo"] as const) {
  test(`erro útil chega à ${operation} e os dados permanecem após recarregar`, async ({
    page,
  }) => {
    await page.goto("/");
    await add(page, "Receita pessoal", "500", "Receita");
    await add(page, "Gasto demonstrativo", "85");
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("vertice-finance", 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("transactions", "readwrite");
          const store = tx.objectStore("transactions");
          const rows = store.getAll();
          rows.onsuccess = () => {
            const demo = rows.result.find(
              (row) => row.description === "Gasto demonstrativo",
            );
            store.put({ ...demo, source: "demo" });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    });
    await page.reload();
    await expect(page.locator(".primary-metric h2")).toContainText("415,00");
    await page.evaluate(() => {
      IDBObjectStore.prototype.delete = function () {
        throw new DOMException("Detalhe técnico", "QuotaExceededError");
      };
      IDBCursor.prototype.delete = function () {
        throw new DOMException("Detalhe técnico", "QuotaExceededError");
      };
    });
    if (operation === "exclusão") {
      await page.getByRole("link", { name: "Transações", exact: true }).click();
      await page
        .getByRole("button", { name: "Excluir Receita pessoal", exact: true })
        .click();
    } else {
      await page
        .getByRole("button", { name: "Remover demonstração", exact: true })
        .click();
    }
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", {
        name:
          operation === "exclusão"
            ? "Confirmar exclusão"
            : "Remover demonstração",
        exact: true,
      })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "armazenamento do navegador está cheio",
    );
    await expect(dialog.getByRole("alert")).not.toContainText(
      "Detalhe técnico",
    );
    await page.reload();
    await page.getByRole("link", { name: "Visão Geral", exact: true }).click();
    await expect(page.locator(".primary-metric h2")).toContainText("415,00");
    await expect(
      page.getByText("Receita pessoal", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", {
        name: "Gasto demonstrativo Demonstração",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("responsividade, navegação mobile e foco do modal", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await expect(page.locator(".dashboard-content")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "artifacts/onboarding-desktop.png",
    fullPage: true,
  });
  await add(page, "Salário julho", "7200", "Receita", "2026-07-01");
  await add(page, "Alimentação julho", "1000", "Gasto", "2026-07-10");
  await add(page, "Salário agosto", "7600", "Receita", "2026-08-01");
  await add(page, "Alimentação agosto", "1050", "Gasto", "2026-08-10");
  await add(page, "Salário", "8200", "Receita");
  await add(page, "Mercado", "1320");
  await page.getByRole("button", { name: "Dispensar confirmação" }).click();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        { message: `Sem rolagem horizontal em ${width}px` },
      )
      .toBe(true);
    if (width === 320) {
      const chart = page.locator(".recharts-wrapper");
      const bounds = await chart.boundingBox();
      await chart.hover({ position: { x: bounds!.width - 30, y: 80 } });
      const tooltip = page.locator(".recharts-tooltip-wrapper");
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText("Saldo líquido");
      await expect
        .poll(
          async () => {
            const tip = await tooltip.boundingBox();
            return !!tip && tip.x >= 0 && tip.x + tip.width <= width;
          },
          {
            message:
              "Tooltip financeiro visível dentro da tela após a animação",
          },
        )
        .toBe(true);
      await page.mouse.move(0, 0);
    }
    if (width === 390) {
      await page.screenshot({
        path: "artifacts/dashboard-mobile.png",
        fullPage: true,
      });
      const addButton = page.locator(".mobile-add");
      await addButton.click();
      await expect(
        page.getByLabel("Valor (R$)", { exact: true }),
      ).toBeFocused();
      for (let i = 0; i < 16; i++) await page.keyboard.press("Tab");
      expect(
        await page.evaluate(() => !!document.activeElement?.closest("dialog")),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(addButton).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByRole("link", { name: "Ir para o conteúdo" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page).toHaveURL(/#\/configuracoes$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
