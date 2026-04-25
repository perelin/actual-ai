/* eslint-disable no-console, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import * as actualApi from '@actual-app/api';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const serverURL = process.env.ACTUAL_SERVER_URL ?? '';
const password = process.env.ACTUAL_PASSWORD ?? '';
const budgetId = process.env.ACTUAL_BUDGET_ID ?? '';
const e2ePassword = process.env.ACTUAL_E2E_PASSWORD ?? '';
const guessedTag = process.env.GUESSED_TAG ?? '#actual-ai';
const dataDir = '/tmp/actual-ai-recon/';

const TOP_IMPORTED = 30;
const TOP_VARIANT_PAYEES = 15;
const RANDOM_SAMPLES = 30;

type Tx = {
  id: string;
  category?: string;
  payee?: string | null;
  imported_payee?: string;
  notes?: string;
  amount: number;
};

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  if (!serverURL || !password || !budgetId) {
    throw new Error('Missing ACTUAL_SERVER_URL / ACTUAL_PASSWORD / ACTUAL_BUDGET_ID in .env');
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  await (actualApi as any).init({ dataDir, serverURL, password });
  try {
    if (e2ePassword) {
      await (actualApi as any).downloadBudget(budgetId, { password: e2ePassword });
    } else {
      await (actualApi as any).downloadBudget(budgetId);
    }

    const payees: { id: string; name: string }[] = await (actualApi as any).getPayees();
    const accounts: { id: string; name: string }[] = await (actualApi as any).getAccounts();
    const categories: { id: string; name: string; group?: string }[] = await (actualApi as any).getCategories();

    let allTx: Tx[] = [];
    for (const account of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const txs: Tx[] = await (actualApi as any).getTransactions(account.id, '1990-01-01', '2030-01-01');
      allTx = allTx.concat(txs);
    }

    const payeeById = new Map(payees.map((p) => [p.id, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const userCategorized = allTx.filter(
      (t) => t.category && !(t.notes ?? '').includes(guessedTag),
    );

    console.log('');
    console.log(`Total transactions:    ${allTx.length}`);
    console.log(`User-categorized:      ${userCategorized.length}`);
    console.log(`(filter: category set AND notes do not contain "${guessedTag}")`);

    type ImportedInfo = {
      count: number;
      payees: Set<string>;
      categories: Map<string, number>;
    };
    const byImported = new Map<string, ImportedInfo>();
    for (const t of userCategorized) {
      const ip = (t.imported_payee ?? '').trim();
      if (!ip) continue;
      let entry = byImported.get(ip);
      if (!entry) {
        entry = { count: 0, payees: new Set(), categories: new Map() };
        byImported.set(ip, entry);
      }
      entry.count += 1;
      if (t.payee) entry.payees.add(t.payee);
      if (t.category) {
        const catName = categoryById.get(t.category)?.name ?? t.category;
        entry.categories.set(catName, (entry.categories.get(catName) ?? 0) + 1);
      }
    }

    const topImported = [...byImported.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, TOP_IMPORTED);

    console.log('');
    console.log(`=== Top ${TOP_IMPORTED} imported_payee strings (user-categorized only) ===`);
    console.log('cnt | imported_payee                                                  | resolved payee(s)              | top category');
    console.log('----+------------------------------------------------------------------+--------------------------------+--------------------');
    for (const [ip, info] of topImported) {
      const resolved = [...info.payees]
        .map((id) => payeeById.get(id)?.name ?? id)
        .join(', ');
      const topCatEntry = [...info.categories.entries()].sort(([, a], [, b]) => b - a)[0];
      const topCat = topCatEntry ? topCatEntry[0] : '-';
      console.log(`${String(info.count).padStart(3)} | ${pad(ip, 64)} | ${pad(resolved, 30)} | ${topCat}`);
    }

    type PayeeInfo = { count: number; importedVariants: Map<string, number> };
    const byPayeeId = new Map<string, PayeeInfo>();
    for (const t of userCategorized) {
      if (!t.payee) continue;
      let entry = byPayeeId.get(t.payee);
      if (!entry) {
        entry = { count: 0, importedVariants: new Map() };
        byPayeeId.set(t.payee, entry);
      }
      entry.count += 1;
      const ip = (t.imported_payee ?? '').trim();
      if (ip) entry.importedVariants.set(ip, (entry.importedVariants.get(ip) ?? 0) + 1);
    }

    const variantPayees = [...byPayeeId.entries()]
      .filter(([, info]) => info.importedVariants.size >= 2)
      .sort(([, a], [, b]) => b.importedVariants.size - a.importedVariants.size)
      .slice(0, TOP_VARIANT_PAYEES);

    console.log('');
    console.log(`=== Top ${TOP_VARIANT_PAYEES} resolved payees with multiple imported_payee variants ===`);
    for (const [pid, info] of variantPayees) {
      const name = payeeById.get(pid)?.name ?? pid;
      console.log('');
      console.log(`${name}  (${info.count} txs, ${info.importedVariants.size} variants)`);
      for (const [ip, c] of [...info.importedVariants.entries()].sort(([, a], [, b]) => b - a)) {
        console.log(`  ${String(c).padStart(3)}× ${ip}`);
      }
    }

    const allUnique = [...byImported.keys()];
    const shuffled = allUnique.slice().sort(() => Math.random() - 0.5);
    const sample = shuffled.slice(0, RANDOM_SAMPLES);
    console.log('');
    console.log(`=== ${RANDOM_SAMPLES} random unique imported_payee samples (diversity check) ===`);
    for (const ip of sample) console.log(`  ${ip}`);
    console.log('');
  } finally {
    await (actualApi as any).shutdown();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
