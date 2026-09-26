import { rawLocal, seedLocal } from "./helpers/localData";
import { expect, test } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";

declare global {
  interface Window {
    financeAudit: typeof import("./helpers/repositoryHarness");
  }
}
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./helpers/repositoryHarness.ts", import.meta.url),
        ),
        name: "financeAudit",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output))
    throw new Error("Não foi possível preparar o teste do repository.");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk")
    throw new Error("Bundle de teste não encontrado.");
  bundle = chunk.code;
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
});

test("primeira inicialização cria stores sem demonstração e persiste salvar/editar/excluir", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    const initial = await r.load();
    const row = transaction();
    await r.save(row);
    await r.save({ ...row, amount: 100.5, description: "Editado" });
    const edited = await r.load();
    return { initial, edited, id: row.id };
  });
  expect(result.initial.transactions).toEqual([]);
  expect(result.initial.settings.accounts).toHaveLength(2);
  expect(result.edited.transactions).toHaveLength(1);
  expect(result.edited.transactions[0]).toMatchObject({
    amount: 100.5,
    description: "Editado",
  });
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(
      async () =>
        (await window.financeAudit.transactionRepository.load()).transactions[0]
          .amount,
    ),
  ).toBe(100.5);
  await page.evaluate(
    (id) => window.financeAudit.transactionRepository.remove(id),
    result.id,
  );
  expect(
    await page.evaluate(
      async () =>
        (await window.financeAudit.transactionRepository.load()).transactions,
    ),
  ).toEqual([]);
});

test("migração v1 preserva origem e destino de transferência e é estável ao recarregar", async ({
  page,
}) => {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("vertice-finance", 1);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore("transactions", { keyPath: "id" })
          .add({
            id: "legacy-transfer",
            type: "transfer",
            amount: 29.9,
            account: "principal",
            destinationAccount: "reserva",
            category: "transfer",
            description: "Transferência antiga",
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
  const snapshot = await page.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(snapshot.transactions).toHaveLength(1);
  expect(snapshot.transactions[0]).toMatchObject({
    id: "legacy-transfer",
    type: "transfer",
    amount: 29.9,
    accountId: "principal",
    destinationAccountId: "reserva",
    categoryId: "transfer",
    source: "manual",
    createdAt: "2026-09-10T12:00:00.000Z",
  });
  expect(snapshot.transactions[0]).not.toHaveProperty("account");
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(() => window.financeAudit.transactionRepository.load()),
  ).toEqual(snapshot);
});

// A2a changes the old fallback contract: a precreated v2 is not a real bootstrap.
test("settings personal ausente em v2: bloqueia load/save/import e preserva stores", async ({
  page,
}) => {
  await seedLocal(page, {
    transactions: [],
    settings: undefined,
    present: false,
  });
  const before = await rawLocal(page);
  const errors = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    const errors: string[] = [];
    for (const operation of [
      () => r.load(),
      () => r.save(transaction()),
      () => r.import([transaction()], true),
    ]) {
      try {
        await operation();
        errors.push("accepted");
      } catch (e) {
        errors.push((e as { code: string }).code);
      }
    }
    return errors;
  });
  expect(errors).toEqual([
    "missing-settings",
    "missing-settings",
    "missing-settings",
  ]);
  expect(await rawLocal(page)).toEqual(before);
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("missing-settings");
  expect(await rawLocal(page)).toEqual(before);
});

for (const [field, value, message] of [
  ["accountId", "ausente", "conta válida"],
  ["categoryId", "ausente", "categoria compatível"],
  ["amount", -1, "Informe um valor"],
  ["destinationAccountId", "principal", "destino diferente"],
] as const) {
  test(`preserva erro útil de ${field} em save/import sem perder registros válidos`, async ({
    page,
  }) => {
    const result = await page.evaluate(
      async ({ field, value }) => {
        const { transactionRepository: r, transaction } = window.financeAudit;
        await r.save(transaction({ id: "existing" }));
        const invalid = transaction(
          field === "destinationAccountId"
            ? { type: "transfer", destinationAccountId: String(value) }
            : { [field]: value },
        );
        const messages: string[] = [];
        for (const operation of [
          () => r.save(invalid),
          () =>
            r.import(
              [transaction({ description: "Válido no lote" }), invalid],
              false,
            ),
        ]) {
          try {
            await operation();
          } catch (e) {
            messages.push((e as Error).message);
          }
        }
        return { messages, rows: (await r.load()).transactions };
      },
      { field, value },
    );
    expect(result.messages).toHaveLength(2);
    result.messages.forEach((m) => expect(m).toContain(message));
    expect(result.rows.map((t) => t.id)).toEqual(["existing"]);
  });
}

test("importação elimina duplicatas persistidas e internas; permite repetições explícitas", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    const saved = transaction({ id: "saved" });
    await r.save(saved);
    const first = await r.import(
      [
        { ...saved, id: "duplicate" },
        transaction({ id: "new1", description: "Novo" }),
        transaction({ id: "new2", description: "Novo" }),
      ],
      true,
    );
    const second = await r.import(
      [
        { ...saved, id: "allowed1" },
        { ...saved, id: "allowed2" },
      ],
      false,
    );
    return { first, second, rows: (await r.load()).transactions };
  });
  expect(result.first).toBe(1);
  expect(result.second).toBe(2);
  expect(result.rows).toHaveLength(4);
  expect(result.rows.some((t) => t.id === "duplicate")).toBe(false);
});

test("erro de chave no meio do lote reverte gravações e preserva a causa nativa", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    await r.save(transaction({ id: "existing" }));
    let message = "",
      cause = "";
    try {
      await r.import(
        [
          transaction({ id: "first" }),
          transaction({ id: "existing", description: "Conflito" }),
        ],
        false,
      );
    } catch (e) {
      message = (e as Error).message;
      cause = ((e as Error).cause as DOMException)?.name;
    }
    return { message, cause, rows: (await r.load()).transactions };
  });
  expect(result.message).toContain("conflito");
  expect(result.cause).toBe("ConstraintError");
  expect(result.rows.map((t) => t.id)).toEqual(["existing"]);
});

test("falha síncrona no meio da importação também reverte o lote inteiro", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    await r.save(transaction({ id: "existing" }));
    const original = IDBObjectStore.prototype.add;
    let calls = 0;
    let cause = "";
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore["add"]>
    ) {
      if (this.name === "transactions" && ++calls === 2)
        throw new DOMException("Falha de teste", "QuotaExceededError");
      return original.apply(this, args);
    };
    try {
      await r.import(
        [transaction(), transaction({ description: "Segundo" })],
        false,
      );
    } catch (e) {
      cause = ((e as Error).cause as DOMException)?.name;
    } finally {
      IDBObjectStore.prototype.add = original;
    }
    return { cause, rows: (await r.load()).transactions };
  });
  expect(result.cause).toBe("QuotaExceededError");
  expect(result.rows.map((t) => t.id)).toEqual(["existing"]);
});

test("configuração incompatível é rejeitada com causa útil sem alterar banco", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    await r.save(transaction({ id: "existing" }));
    const initial = await r.load();
    const next = structuredClone(initial.settings);
    next.accounts = next.accounts.filter((a) => a.id !== "principal");
    let message = "";
    try {
      await r.saveSettings(next);
    } catch (e) {
      message = (e as Error).message;
    }
    return { initial, after: await r.load(), message };
  });
  expect(result.message).toContain("conta válida");
  expect(result.after).toEqual(result.initial);
});

test("settings inválidos persistidos não são substituídos silenciosamente por padrões", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    await r.save(transaction({ id: "existing" }));
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("vertice-finance", 2);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("settings", "readwrite");
        tx.objectStore("settings").put({}, "personal");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
    });
    const messages: string[] = [];
    for (const op of [
      () => r.load(),
      () => r.save(transaction()),
      () => r.import([transaction()], false),
    ]) {
      try {
        await op();
      } catch (e) {
        messages.push((e as Error).message);
      }
    }
    const raw = await new Promise<{ rows: unknown[]; settings: unknown }>(
      (resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 2);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction(["settings", "transactions"]),
            rows = tx.objectStore("transactions").getAll(),
            settings = tx.objectStore("settings").get("personal");
          tx.oncomplete = () => {
            db.close();
            resolve({ rows: rows.result, settings: settings.result });
          };
          tx.onabort = () => reject(tx.error);
        };
      },
    );
    return { messages, raw };
  });
  expect(result.messages).toHaveLength(3);
  result.messages.forEach((m) => {
    expect(m).not.toContain("Cannot read");
    expect(m).toContain("configurações");
  });
  expect(result.raw.settings).toEqual({});
  expect(result.raw.rows).toHaveLength(1);
});

test("transferência persistida, editada e excluída preserva o total das contas e o resumo", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      defaultSettings,
      summarize,
      accountBalance,
      totalAccountBalance,
    } = window.financeAudit;
    const settings = defaultSettings();
    settings.accounts[0].initialBalance = 5000;
    settings.accounts[1].initialBalance = 2000;
    await r.saveSettings(settings);
    await r.save(
      transaction({ type: "income", categoryId: "income", amount: 2000 }),
    );
    await r.save(transaction({ amount: 500 }));
    const snapshot = async () => {
      const { transactions, settings } = await r.load();
      return {
        summary: summarize(transactions),
        a: accountBalance(settings.accounts[0], transactions),
        b: accountBalance(settings.accounts[1], transactions),
        total: totalAccountBalance(settings.accounts, transactions),
      };
    };
    const baseline = await snapshot();
    const transfer = transaction({
      type: "transfer",
      id: "transfer",
      amount: 1000,
    });
    await r.save(transfer);
    const added = await snapshot();
    await r.save({ ...transfer, amount: 2500 });
    const edited = await snapshot();
    await r.remove(transfer.id);
    return { baseline, added, edited, deleted: await snapshot() };
  });
  expect(result.baseline).toMatchObject({ a: 6500, b: 2000, total: 8500 });
  expect(result.added).toMatchObject({ a: 5500, b: 3000, total: 8500 });
  expect(result.edited).toMatchObject({ a: 4000, b: 4500, total: 8500 });
  expect(result.deleted).toEqual(result.baseline);
  expect(result.added.summary).toEqual(result.baseline.summary);
  expect(result.edited.summary).toEqual(result.baseline.summary);
});

test("remoção da demonstração preserva IDs pessoais e todas as configurações", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      defaultSettings,
    } = window.financeAudit;
    const settings = defaultSettings();
    settings.plannedIncome = 5000;
    await r.saveSettings(settings);
    await r.import(
      [
        transaction({ id: "demo-explicit", source: "demo" }),
        transaction({ id: "demo-personal-id", source: "manual" }),
        transaction({ id: "imported", source: "import" }),
      ],
      false,
    );
    await r.removeDemo();
    return await r.load();
  });
  expect(result.transactions.map((t) => t.id).sort()).toEqual([
    "demo-personal-id",
    "imported",
  ]);
  expect(result.settings.plannedIncome).toBe(5000);
});

for (const operation of ["remove", "removeDemo"] as const) {
  test(`falha síncrona em ${operation} preserva causa e reverte exclusões`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (operation) => {
      const { transactionRepository: r, transaction } = window.financeAudit;
      await r.import(
        [
          transaction({ id: "a-demo", source: "demo" }),
          transaction({ id: "b-demo", source: "demo" }),
          transaction({ id: "personal", source: "manual" }),
        ],
        false,
      );
      const before = await r.load();
      const storeDelete = IDBObjectStore.prototype.delete;
      const cursorDelete = IDBCursor.prototype.delete;
      let calls = 0;
      IDBObjectStore.prototype.delete = function (...args) {
        if (this.name === "transactions")
          throw new DOMException(
            "Detalhe técnico de teste",
            "QuotaExceededError",
          );
        return storeDelete.apply(this, args);
      };
      IDBCursor.prototype.delete = function () {
        if (++calls === 2)
          throw new DOMException(
            "Detalhe técnico de teste",
            "QuotaExceededError",
          );
        return cursorDelete.call(this);
      };
      let message = "",
        cause = "";
      try {
        if (operation === "remove") await r.remove("personal");
        else await r.removeDemo();
      } catch (e) {
        message = (e as Error).message;
        cause = ((e as Error).cause as DOMException)?.name;
      } finally {
        IDBObjectStore.prototype.delete = storeDelete;
        IDBCursor.prototype.delete = cursorDelete;
      }
      return { before, after: await r.load(), message, cause, calls };
    }, operation);
    expect(result.message).toContain("armazenamento do navegador está cheio");
    expect(result.message).not.toContain("Detalhe técnico");
    expect(result.cause).toBe("QuotaExceededError");
    expect(result.after).toEqual(result.before);
    if (operation === "removeDemo") expect(result.calls).toBe(2);
    await page.reload();
    await page.evaluate((code) => (0, eval)(code), bundle);
    expect(
      await page.evaluate(() =>
        window.financeAudit.transactionRepository.load(),
      ),
    ).toEqual(result.before);
  });
}
