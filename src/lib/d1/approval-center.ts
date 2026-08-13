import { getD1 } from "./context";

export type ApprovalQueueItem = {
  key: string;
  category: "PEMBELIAN" | "HUTANG_SUPPLIER" | "JURNAL" | "ASET" | "PENYUSUTAN" | "STOCK_OPNAME";
  reference: string;
  title: string;
  detail: string;
  amount: number | null;
  createdBy: string;
  createdAt: string;
  href: string;
};

type QueryResult<T> = { results: T[] };

async function safeRows<T>(label: string, task: () => Promise<QueryResult<T>>) {
  try {
    return (await task()).results;
  } catch (error) {
    console.error(`APPROVAL_QUEUE_${label}`, error);
    return [] as T[];
  }
}

export async function getApprovalQueue(organizationId: string) {
  const db = getD1();

  const [prs, invoices, journals, assets, depreciation, opname] = await Promise.all([
    safeRows("PURCHASE_REQUEST", () =>
      db.prepare(`SELECT id,pr_number,notes,total_estimated_amount,requested_by,created_at
        FROM purchase_requests WHERE organization_id=? AND status='SUBMITTED' ORDER BY created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;pr_number:string;notes:string|null;total_estimated_amount:number;requested_by:string;created_at:string}>()
    ),
    safeRows("SUPPLIER_INVOICE", () =>
      db.prepare(`SELECT si.id,si.invoice_number,si.total_amount,si.created_by,si.created_at,s.name AS supplier_name
        FROM supplier_invoices si JOIN suppliers s ON s.id=si.supplier_id
        WHERE si.organization_id=? AND si.status='MATCHED' AND si.match_status='MATCH'
        ORDER BY si.created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;invoice_number:string;total_amount:number;created_by:string;created_at:string;supplier_name:string}>()
    ),
    safeRows("CONTROLLED_JOURNAL", () =>
      db.prepare(`SELECT cj.id,cj.journal_number,cj.description,cj.created_by,cj.created_at,
          COALESCE((SELECT SUM(cjl.debit_amount) FROM controlled_journal_lines cjl WHERE cjl.controlled_journal_id=cj.id),0) AS total_debit
        FROM controlled_journals cj
        WHERE cj.organization_id=? AND cj.status='SUBMITTED'
        ORDER BY cj.created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;journal_number:string;description:string;total_debit:number;created_by:string;created_at:string}>()
    ),
    safeRows("FIXED_ASSET", () =>
      db.prepare(`SELECT id,asset_code,name,acquisition_cost_amount,created_by,created_at
        FROM fixed_assets WHERE organization_id=? AND status='DRAFT' ORDER BY created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;asset_code:string;name:string;acquisition_cost_amount:number;created_by:string;created_at:string}>()
    ),
    safeRows("DEPRECIATION", () =>
      db.prepare(`SELECT id,run_number,period_month,total_amount,created_by,created_at
        FROM asset_depreciation_runs WHERE organization_id=? AND status='DRAFT' ORDER BY created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;run_number:string;period_month:string;total_amount:number;created_by:string;created_at:string}>()
    ),
    safeRows("STOCK_OPNAME", () =>
      db.prepare(`SELECT id,session_number,notes,created_by,created_at
        FROM stock_opname_sessions WHERE organization_id=? AND status='COUNTED' ORDER BY created_at ASC LIMIT 80`)
        .bind(organizationId).all<{id:string;session_number:string;notes:string|null;created_by:string;created_at:string}>()
    ),
  ]);

  const items: ApprovalQueueItem[] = [];
  for (const row of prs) items.push({ key:`pr:${row.id}`,category:"PEMBELIAN",reference:row.pr_number,title:"Permintaan pembelian menunggu persetujuan",detail:row.notes||"Permintaan pembelian sudah dikirim untuk diperiksa.",amount:Number(row.total_estimated_amount),createdBy:row.requested_by,createdAt:row.created_at,href:"/procurement" });
  for (const row of invoices) items.push({ key:`invoice:${row.id}`,category:"HUTANG_SUPPLIER",reference:row.invoice_number,title:`Invoice ${row.supplier_name}`,detail:"PO, penerimaan barang, dan invoice sudah cocok dan menunggu pemeriksaan.",amount:Number(row.total_amount),createdBy:row.created_by,createdAt:row.created_at,href:"/procurement/ap" });
  for (const row of journals) items.push({ key:`journal:${row.id}`,category:"JURNAL",reference:row.journal_number,title:row.description,detail:"Jurnal sudah seimbang dan menunggu pemeriksa yang berbeda.",amount:Number(row.total_debit),createdBy:row.created_by,createdAt:row.created_at,href:`/finance/journals/${row.id}` });
  for (const row of assets) items.push({ key:`asset:${row.id}`,category:"ASET",reference:row.asset_code,title:row.name,detail:"Aset belum aktif dan masih menunggu pemeriksaan.",amount:Number(row.acquisition_cost_amount),createdBy:row.created_by,createdAt:row.created_at,href:"/finance/assets" });
  for (const row of depreciation) items.push({ key:`depr:${row.id}`,category:"PENYUSUTAN",reference:row.run_number,title:`Penyusutan bulan ${row.period_month}`,detail:"Perhitungan penyusutan menunggu pemeriksa sebelum masuk ke jurnal.",amount:Number(row.total_amount),createdBy:row.created_by,createdAt:row.created_at,href:"/finance/assets" });
  for (const row of opname) items.push({ key:`opname:${row.id}`,category:"STOCK_OPNAME",reference:row.session_number,title:"Hasil hitung stok menunggu pemeriksaan",detail:row.notes||"Selisih stok fisik dan sistem perlu diperiksa sebelum penyesuaian stok dicatat.",amount:null,createdBy:row.created_by,createdAt:row.created_at,href:`/inventory/opname/${row.id}` });

  return items.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
}
