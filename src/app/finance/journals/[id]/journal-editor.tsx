"use client";

import { useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { saveControlledJournalDraftAction } from "../actions";
import styles from "./journal-detail.module.css";

type AccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: string;
};

type InitialLine = {
  id?: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  memo: string | null;
};

type EditorLine = {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
  memo: string;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function newLine(initial?: InitialLine): EditorLine {
  return {
    key: initial?.id || crypto.randomUUID(),
    accountId: initial?.account_id || "",
    debit: initial?.debit_amount ? String(initial.debit_amount) : "",
    credit: initial?.credit_amount ? String(initial.credit_amount) : "",
    memo: initial?.memo || "",
  };
}

export function JournalEditor({
  journalId,
  journalDate,
  description,
  journalType,
  accounts,
  initialLines,
}: {
  journalId: string;
  journalDate: string;
  description: string;
  journalType: "MANUAL" | "OPENING";
  accounts: AccountOption[];
  initialLines: InitialLine[];
}) {
  const [lines, setLines] = useState<EditorLine[]>(() => initialLines.length ? initialLines.map(newLine) : [newLine(), newLine()]);

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.debit || 0))), 0);
    const credit = lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(Number(line.credit || 0))), 0);
    return { debit, credit, balanced: debit > 0 && debit === credit && lines.filter((line) => line.accountId && (Number(line.debit) > 0 || Number(line.credit) > 0)).length >= 2 };
  }, [lines]);

  function patchLine(key: string, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function lineJson() {
    return JSON.stringify(lines
      .filter((line) => line.accountId && (Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0))
      .map((line) => ({
        accountId: line.accountId,
        debitAmount: Math.max(0, Math.trunc(Number(line.debit || 0))),
        creditAmount: Math.max(0, Math.trunc(Number(line.credit || 0))),
        memo: line.memo.trim(),
      })));
  }

  return <form action={saveControlledJournalDraftAction} className={styles.editorForm}>
    <input type="hidden" name="journalId" value={journalId} />
    <input type="hidden" name="linesJson" value={lineJson()} />
    <div className={styles.headerFields}>
      <label>Tanggal jurnal<input type="date" name="journalDate" defaultValue={journalDate} required /></label>
      <label className={styles.descriptionField}>Deskripsi<input name="description" defaultValue={description} minLength={5} maxLength={180} required /></label>
      <div className={styles.typeBox}><span>Jenis</span><strong>{journalType}</strong></div>
    </div>

    <div className={styles.editorTableWrap}>
      <table className={styles.editorTable}>
        <thead><tr><th>#</th><th>Akun</th><th>Debit</th><th>Kredit</th><th>Memo</th><th></th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.key}>
          <td>{index + 1}</td>
          <td><select value={line.accountId} onChange={(event) => patchLine(line.key, { accountId: event.target.value })} required>
            <option value="">Pilih akun</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · {account.account_type}</option>)}
          </select></td>
          <td><input type="number" min="0" step="1" value={line.debit} onChange={(event) => patchLine(line.key, { debit: event.target.value, credit: Number(event.target.value) > 0 ? "" : line.credit })} placeholder="0" /></td>
          <td><input type="number" min="0" step="1" value={line.credit} onChange={(event) => patchLine(line.key, { credit: event.target.value, debit: Number(event.target.value) > 0 ? "" : line.debit })} placeholder="0" /></td>
          <td><input value={line.memo} onChange={(event) => patchLine(line.key, { memo: event.target.value })} maxLength={160} placeholder="Opsional" /></td>
          <td><button type="button" className={styles.removeLine} disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>×</button></td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className={styles.editorFooter}>
      <button type="button" className={styles.addLine} disabled={lines.length >= 50} onClick={() => setLines((current) => [...current, newLine()])}>+ Tambah Baris</button>
      <div className={`${styles.balanceBox} ${totals.balanced ? styles.balancePass : styles.balanceCheck}`}>
        <span>Debit <b>{rupiah(totals.debit)}</b></span><span>Kredit <b>{rupiah(totals.credit)}</b></span><strong>{totals.balanced ? "BALANCED" : `SELISIH ${rupiah(totals.debit - totals.credit)}`}</strong>
      </div>
      <PendingSubmitButton pendingLabel="Menyimpan jurnal…" disabled={!totals.balanced}>Simpan Draft</PendingSubmitButton>
    </div>
  </form>;
}
