import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, KeyRound, Loader2 } from "lucide-react";
import { staffApi } from "../services/staffApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDateTime, humanize } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { SearchInput } from "../components/common/SearchInput";
import { Pagination } from "../components/common/Pagination";
import { Modal } from "../components/common/Modal";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";

const sel = "text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:ring-1 focus:ring-[#00130d] outline-none";
const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";

/** manage implies read, so a module has one of three levels: none | read | manage. */
const levelOf = (perms, mod) => (perms.includes(`${mod}.manage`) ? "manage" : perms.includes(`${mod}.read`) ? "read" : "none");
const toPerms = (levels) => Object.entries(levels).flatMap(([m, l]) => (l === "manage" ? [`${m}.manage`] : l === "read" ? [`${m}.read`] : []));
const modulesOf = (catalog) => [...new Set((catalog?.permissions || []).map((p) => p.split(".")[0]))];
const levelsFrom = (perms, modules) => Object.fromEntries(modules.map((m) => [m, levelOf(perms, m)]));

const PermissionMatrix = ({ catalog, levels, onChange, error }) => {
  const modules = modulesOf(catalog);
  const templates = catalog?.templates || {};
  return <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">Start from:</span>
        {Object.entries(templates).map(([name, perms]) => <button key={name} type="button" className="px-2 py-1 text-[11px] font-semibold rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => onChange(levelsFrom(perms, modules))}>{humanize(name)}</button>)}
        <button type="button" className="px-2 py-1 text-[11px] font-semibold rounded-md text-slate-500 hover:bg-slate-100" onClick={() => onChange(levelsFrom([], modules))}>Clear</button>
      </div>
      <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
        {modules.map((m) => <div key={m} className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="font-medium text-slate-800">{humanize(m)}</span>
            <select className={sel} value={levels[m] || "none"} onChange={(e) => onChange({ ...levels, [m]: e.target.value })}>
              <option value="none">No access</option><option value="read">View only</option><option value="manage">View &amp; manage</option>
            </select>
          </div>)}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>;
};

const StaffEditor = ({ member, catalog, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(member);
  const modules = modulesOf(catalog);
  const [f, setF] = useState({ name: member?.name || "", email: member?.email || "", phone: member?.phone || "", password: "" });
  const [levels, setLevels] = useState(() => levelsFrom(member?.permissions || [], modules));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: (b) => (isEdit ? staffApi.update(member._id, b) : staffApi.create(b)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: keys.staff.all }); addToast(isEdit ? "Staff member updated." : "Staff member created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the staff member"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    if (save.isPending) return;
    const e = {};
    if (!f.name.trim()) e.name = "Name is required.";
    if (!isEdit) {
      if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = "Enter a valid email.";
      if (!f.phone.trim()) e.phone = "Phone is required.";
      if (f.password.length < 8 || f.password.length > 72) e.password = "Password must be 8–72 characters.";
    }
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    const permissions = toPerms(levels);
    save.mutate(isEdit ? { name: f.name.trim(), permissions } : { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, permissions });
  };
  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? "Edit staff member" : "Add staff member"} maxWidth="lg">
      <div className="space-y-3">
        <FormField label="Full name" required error={errors.name}><input className={inp} value={f.name} onChange={set("name")} /></FormField>
        {!isEdit && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Email" required error={errors.email}><input type="email" autoComplete="off" className={inp} value={f.email} onChange={set("email")} /></FormField>
            <FormField label="Phone" required error={errors.phone}><input className={inp} value={f.phone} onChange={set("phone")} /></FormField>
            <FormField label="Initial password" required error={errors.password} hint="8–72 characters. Share it securely; it is not shown again."><input type="password" autoComplete="new-password" className={inp} value={f.password} onChange={set("password")} /></FormField>
          </div>}
        <FormField label="Permissions" error={errors.permissions}><PermissionMatrix catalog={catalog} levels={levels} onChange={setLevels} /></FormField>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{isEdit ? "Save changes" : "Create staff member"}</button></div>
      </div>
    </Modal>;
};

const ResetPasswordModal = ({ member, onClose }) => {
  const addToast = useToastStore((s) => s.addToast);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const reset = useMutation({
    mutationFn: () => staffApi.resetPassword(member._id, password),
    onSuccess: () => { addToast("Password reset. Their existing sessions were ended."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not reset the password"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    if (reset.isPending) return;
    if (password.length < 8 || password.length > 72) { setErrors({ password: "Password must be 8–72 characters." }); return; }
    setErrors({}); setGeneral(""); reset.mutate();
  };
  return <Modal isOpen onClose={() => !reset.isPending && onClose()} title={`Reset password — ${member.name}`} maxWidth="sm">
      <div className="space-y-3">
        <FormField label="New password" required error={errors.password} hint="Signs this person out everywhere."><input type="password" autoComplete="new-password" className={inp} value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={reset.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={reset.isPending}>{reset.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Reset password</button></div>
      </div>
    </Modal>;
};

export const StaffPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editor, setEditor] = useState(null);
  const [resetting, setResetting] = useState(null);
  const dq = useDebouncedValue(search, 350);

  const params = { search: dq.trim() || undefined, status: status === "all" ? undefined : status, page, limit: pageSize };
  const listQuery = useQuery({ queryKey: keys.staff.list(params), queryFn: () => staffApi.list(params), placeholderData: keepPreviousData });
  const catalogQuery = useQuery({ queryKey: keys.staff.permissions, queryFn: staffApi.catalog, staleTime: 10 * 60 * 1000 });
  const items = listQuery.data?.items || [];
  const meta = listQuery.data?.meta;

  const toggle = useMutation({
    mutationFn: ({ id, isActive }) => staffApi.setActive(id, isActive),
    onSuccess: (_d, v) => { queryClient.invalidateQueries({ queryKey: keys.staff.all }); addToast(v.isActive ? "Account activated." : "Account deactivated."); },
    onError: (e) => addToast(errorMessage(e, "Could not change the account status"), "error"),
  });
  const reset = (setter) => (v) => { setter(v); setPage(1); };

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "Settings" }, { label: "Staff" }]} title="Staff & Permissions" description="Create staff accounts and choose which modules each person can view or manage. Only the owner sees this page."
        actions={<button disabled={!catalogQuery.data} onClick={() => setEditor({ member: null })} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors disabled:opacity-50"><Plus className="w-4 h-4" /> Add staff</button>} />
      {catalogQuery.isError && <p className="text-xs text-rose-600">Couldn't load the permission list. <button className="underline" onClick={() => catalogQuery.refetch()}>Retry</button></p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="max-w-md w-full"><SearchInput value={search} onChange={reset(setSearch)} placeholder="Search by name, email or phone..." /></div>
        <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} className={sel}><option value="all">All Accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} className="border-0" /> : listQuery.isLoading ? <div className="p-6"><LoadingSkeleton rows={5} /></div> : items.length === 0 ? <div className="p-12"><EmptyState title="No staff accounts found" description={dq || status !== "all" ? "Try changing the search or filter." : "Add your first staff member to share the workload."} /></div> : <div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500"><th className="py-3 px-4">Person</th><th className="py-3 px-4">Role</th><th className="py-3 px-4">Access</th><th className="py-3 px-4">Last sign-in</th><th className="py-3 px-4">Active</th><th className="py-3 px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100 text-xs">{items.map((m) => {
              const owner = m.role === "admin";
              return <tr key={m._id} className="hover:bg-slate-50/70">
                <td className="py-3.5 px-4"><div className="font-semibold text-slate-900">{m.name}</div><div className="text-slate-500">{m.email} · {m.phone}</div></td>
                <td className="py-3.5 px-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">{owner ? "Owner" : "Staff"}</span></td>
                <td className="py-3.5 px-4 text-slate-600">{owner ? "Full access" : `${new Set((m.permissions || []).map((p) => p.split(".")[0])).size} modules`}</td>
                <td className="py-3.5 px-4 text-slate-600">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "Never"}</td>
                <td className="py-3.5 px-4">{owner ? <span className="text-slate-400">—</span> : <Toggle checked={m.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: m._id, isActive: v })} />}</td>
                <td className="py-3.5 px-4 text-right">{!owner && <div className="inline-flex gap-1">
                    <button disabled={!catalogQuery.data} onClick={() => setEditor({ member: m })} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg disabled:opacity-40" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setResetting(m)} className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg" title="Reset password"><KeyRound className="w-4 h-4" /></button>
                  </div>}</td>
              </tr>;
            })}</tbody></table></div>}
        {meta && items.length > 0 && <Pagination currentPage={meta.page} totalItems={meta.total} pageSize={meta.limit} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} labelSingular="account" labelPlural="accounts" />}
        {listQuery.isFetching && !listQuery.isLoading && <div className="px-4 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5 border-t border-slate-100"><Loader2 className="w-3 h-3 animate-spin" /> Updating…</div>}
      </div>

      {editor && catalogQuery.data && <StaffEditor key={editor.member?._id || "new"} member={editor.member} catalog={catalogQuery.data} onClose={() => setEditor(null)} />}
      {resetting && <ResetPasswordModal key={resetting._id} member={resetting} onClose={() => setResetting(null)} />}
    </div>;
};
