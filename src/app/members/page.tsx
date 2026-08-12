import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessContext } from "@/lib/access/context";
import { createClient } from "@/lib/supabase/server";
import { createMember, setMemberStatus } from "./actions";
import styles from "./members.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    created?: string;
    updated?: string;
    error?: string;
  }>;
};

function errorMessage(code?: string) {
  if (code === "duplicate") return "Nomor anggota sudah digunakan pada organisasi ini.";
  if (code === "forbidden") return "Akun Anda tidak memiliki izin untuk mengubah data anggota.";
  if (code === "invalid") return "Data belum lengkap atau formatnya tidak valid.";
  if (code === "save") return "Data belum dapat disimpan. Coba lagi setelah memeriksa isian.";
  return null;
}

function statusClass(status: string) {
  if (status === "PENDING") return `${styles.badge} ${styles.badgePending}`;
  if (status === "SUSPENDED") return `${styles.badge} ${styles.badgeSuspended}`;
  if (status === "ENDED") return `${styles.badge} ${styles.badgeEnded}`;
  return styles.badge;
}

export default async function MembersPage({ searchParams }: PageProps) {
  const access = await getAccessContext();
  if (!access) redirect("/login");
  if (!access.permissions.includes("MEMBER_VIEW")) redirect("/dashboard");

  const params = await searchParams;
  const q = String(params.q ?? "").trim().toLowerCase();
  const canManage = access.permissions.includes("MEMBER_MANAGE");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id,member_number,full_name,phone,household_code,hamlet,rt,rw,member_since,status,created_at")
    .eq("organization_id", access.organization.id)
    .order("member_number", { ascending: true });

  const members = data ?? [];
  const filtered = q
    ? members.filter((member) =>
        [member.member_number, member.full_name, member.phone, member.household_code, member.hamlet]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      )
    : members;

  const counts = members.reduce(
    (acc, member) => {
      acc.total += 1;
      if (member.status === "ACTIVE") acc.active += 1;
      if (member.status === "PENDING") acc.pending += 1;
      if (member.status === "SUSPENDED") acc.suspended += 1;
      return acc;
    },
    { total: 0, active: 0, pending: 0, suspended: 0 },
  );

  const failure = errorMessage(params.error) || (error ? "Daftar anggota belum dapat dibaca." : null);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.mark}>KD</div>
          <div>
            <strong>Master Anggota</strong>
            <span>{access.organization.name} · {access.role.name}</span>
          </div>
        </div>
        <div className={styles.topActions}>
          <Link className={styles.linkButton} href="/dashboard">Dashboard</Link>
          {access.permissions.includes("POS_ACCESS") ? (
            <Link className={styles.primaryButton} href="/teller">Buka Teller</Link>
          ) : null}
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.headingRow}>
          <div>
            <p className={styles.kicker}>PHASE 1 · MEMBER MASTER</p>
            <h1>Data Anggota</h1>
            <p>
              Registry anggota operasional untuk pencarian teller, transaksi, dan layanan anggota. Saat development gunakan data dummy terlebih dahulu.
            </p>
          </div>
        </section>

        {params.created ? <div className={styles.alert}>Anggota baru berhasil ditambahkan.</div> : null}
        {params.updated ? <div className={styles.alert}>Status anggota berhasil diperbarui.</div> : null}
        {failure ? <div className={`${styles.alert} ${styles.alertError}`}>{failure}</div> : null}

        <section className={styles.statGrid} aria-label="Ringkasan anggota">
          <article className={styles.statCard}><span>Total anggota</span><strong>{counts.total}</strong><small>Semua status</small></article>
          <article className={styles.statCard}><span>Aktif</span><strong>{counts.active}</strong><small>Siap digunakan operasional</small></article>
          <article className={styles.statCard}><span>Pending</span><strong>{counts.pending}</strong><small>Menunggu aktivasi</small></article>
          <article className={styles.statCard}><span>Suspended</span><strong>{counts.suspended}</strong><small>Akses layanan dibatasi</small></article>
        </section>

        <section className={styles.toolbar}>
          <form className={styles.searchForm} method="get">
            <input
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Cari nomor, nama, telepon, KK, atau wilayah..."
              aria-label="Cari anggota"
            />
            <button type="submit">Cari</button>
          </form>
          {q ? <Link className={styles.linkButton} href="/members">Reset</Link> : null}
        </section>

        {canManage ? (
          <details className={styles.createPanel}>
            <summary>+ Tambah anggota development</summary>
            <form className={styles.formGrid} action={createMember}>
              <label>
                Nomor anggota
                <input name="member_number" placeholder="DEV-0004" required minLength={3} maxLength={40} />
              </label>
              <label className={styles.formWide}>
                Nama lengkap
                <input name="full_name" placeholder="Nama anggota" required minLength={2} maxLength={160} />
              </label>
              <label>
                Telepon
                <input name="phone" placeholder="08..." maxLength={32} />
              </label>
              <label>
                Kode KK internal
                <input name="household_code" placeholder="KK-DEMO-004" maxLength={60} />
              </label>
              <label>
                Dusun / wilayah
                <input name="hamlet" placeholder="Wilayah demo" maxLength={80} />
              </label>
              <label>
                RT
                <input name="rt" placeholder="001" maxLength={8} />
              </label>
              <label>
                RW
                <input name="rw" placeholder="001" maxLength={8} />
              </label>
              <label>
                Status awal
                <select name="status" defaultValue="ACTIVE">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PENDING">PENDING</option>
                </select>
              </label>
              <p className={styles.piiNote}>
                NIK penuh belum diminta pada fase development. Struktur data sensitif sudah dipisahkan dan baru akan diaktifkan setelah server-side encryption/key management selesai.
              </p>
              <div className={styles.formActions}>
                <button type="submit">Simpan Anggota Demo</button>
              </div>
            </form>
          </details>
        ) : null}

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <strong>Daftar anggota</strong>
            <span>{filtered.length} dari {members.length} data</span>
          </div>

          {filtered.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>No. Anggota</th>
                    <th>Nama</th>
                    <th>KK / Wilayah</th>
                    <th>Telepon</th>
                    <th>Sejak</th>
                    <th>Status</th>
                    {canManage ? <th>Tindakan</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((member) => (
                    <tr key={member.id}>
                      <td>
                        <strong>{member.member_number}</strong>
                        {member.member_number.startsWith("DEV-") ? <span className={styles.demo}>DEMO</span> : null}
                      </td>
                      <td className={styles.memberName}>
                        <strong>{member.full_name}</strong>
                        <span>{member.hamlet || "Wilayah belum diisi"}</span>
                      </td>
                      <td>
                        {member.household_code || "—"}
                        <br />
                        <small>RT {member.rt || "—"} / RW {member.rw || "—"}</small>
                      </td>
                      <td>{member.phone || "—"}</td>
                      <td>{member.member_since}</td>
                      <td><span className={statusClass(member.status)}>{member.status}</span></td>
                      {canManage ? (
                        <td>
                          <div className={styles.actions}>
                            {member.status !== "ACTIVE" ? (
                              <form action={setMemberStatus}>
                                <input type="hidden" name="member_id" value={member.id} />
                                <input type="hidden" name="status" value="ACTIVE" />
                                <button type="submit">Aktifkan</button>
                              </form>
                            ) : (
                              <form action={setMemberStatus}>
                                <input type="hidden" name="member_id" value={member.id} />
                                <input type="hidden" name="status" value="SUSPENDED" />
                                <button type="submit">Suspend</button>
                              </form>
                            )}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>Tidak ada anggota yang cocok dengan pencarian.</div>
          )}
        </section>
      </div>
    </main>
  );
}
