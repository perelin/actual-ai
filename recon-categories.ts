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

const TOP_PAYEES_PER_CATEGORY = 8;

type Tx = {
  id: string;
  category?: string;
  payee?: string | null;
  imported_payee?: string;
  notes?: string;
  amount: number;
};

type Category = {
  id: string;
  name: string;
  group_id?: string;
  is_income?: boolean;
  hidden?: boolean;
};

type CategoryGroup = {
  id: string;
  name: string;
  is_income?: boolean;
  hidden?: boolean;
  categories?: Category[];
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

    const accounts: { id: string; name: string }[] = await (actualApi as any).getAccounts();
    const categoryGroups: CategoryGroup[] = await (actualApi as any).getCategoryGroups();
    const categories: Category[] = await (actualApi as any).getCategories();
    const payees: { id: string; name: string }[] = await (actualApi as any).getPayees();

    let allTx: Tx[] = [];
    for (const account of accounts) {
      // eslint-disable-next-line no-await-in-loop
      const txs: Tx[] = await (actualApi as any).getTransactions(account.id, '1990-01-01', '2030-01-01');
      allTx = allTx.concat(txs);
    }

    const userCategorized = allTx.filter(
      (t) => t.category && !(t.notes ?? '').includes(guessedTag),
    );

    const payeeById = new Map(payees.map((p) => [p.id, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const groupById = new Map(categoryGroups.map((g) => [g.id, g]));

    type CatStat = {
      total: number;
      payees: Map<string, number>;
    };
    const byCategory = new Map<string, CatStat>();
    for (const t of userCategorized) {
      if (!t.category) continue;
      let entry = byCategory.get(t.category);
      if (!entry) {
        entry = { total: 0, payees: new Map() };
        byCategory.set(t.category, entry);
      }
      entry.total += 1;
      const pname = t.payee ? payeeById.get(t.payee)?.name ?? t.payee : '(no payee)';
      entry.payees.set(pname, (entry.payees.get(pname) ?? 0) + 1);
    }

    console.log('');
    console.log(`Total transactions:    ${allTx.length}`);
    console.log(`User-categorized:      ${userCategorized.length}`);
    console.log(`(filter: category set AND notes do not contain "${guessedTag}")`);
    console.log('');
    console.log(`Total category groups: ${categoryGroups.length}`);
    console.log(`Total categories:      ${categories.length}`);
    console.log('');

    // Group categories by group, preserve order from API
    const grouped = new Map<string, Category[]>();
    for (const cat of categories) {
      const gid = cat.group_id ?? '__ungrouped__';
      if (!grouped.has(gid)) grouped.set(gid, []);
      grouped.get(gid)!.push(cat);
    }

    console.log('=== Categories by group (with usage counts and top payees) ===');
    for (const group of categoryGroups) {
      const cats = grouped.get(group.id) ?? [];
      if (cats.length === 0) continue;
      const flag = group.is_income ? ' [income]' : '';
      const hidden = group.hidden ? ' [hidden]' : '';
      console.log('');
      console.log(`### ${group.name}${flag}${hidden}  (${cats.length} categories)`);
      for (const cat of cats) {
        const stat = byCategory.get(cat.id);
        const total = stat?.total ?? 0;
        const catFlag = cat.is_income ? ' [income]' : '';
        const catHidden = cat.hidden ? ' [hidden]' : '';
        console.log(`  - ${pad(cat.name, 36)} ${String(total).padStart(4)} tx${catFlag}${catHidden}`);
        if (stat && stat.payees.size > 0) {
          const top = [...stat.payees.entries()]
            .sort(([, a], [, b]) => b - a)
            .slice(0, TOP_PAYEES_PER_CATEGORY);
          for (const [pname, c] of top) {
            console.log(`      ${String(c).padStart(3)}× ${pname}`);
          }
        }
      }
    }

    // Categories that exist but have no group_id (ungrouped)
    const ungrouped = grouped.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      console.log('');
      console.log('### (ungrouped)');
      for (const cat of ungrouped) {
        const stat = byCategory.get(cat.id);
        const total = stat?.total ?? 0;
        console.log(`  - ${pad(cat.name, 36)} ${String(total).padStart(4)} tx`);
      }
    }

    // Categories used in transactions but no longer present (deleted/hidden but tx still references)
    const orphanCatIds = [...byCategory.keys()].filter((id) => !categoryById.has(id));
    if (orphanCatIds.length > 0) {
      console.log('');
      console.log('=== Orphan category IDs (referenced by tx but not in categories list) ===');
      for (const id of orphanCatIds) {
        const stat = byCategory.get(id)!;
        console.log(`  ${String(stat.total).padStart(4)} tx | ${id}`);
      }
    }

    console.log('');
  } finally {
    await (actualApi as any).shutdown();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
