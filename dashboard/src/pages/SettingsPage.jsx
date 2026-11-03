import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Store, Truck, CreditCard, Users, Save, Plus, Pencil, Trash2, X } from "lucide-react";
import { settingsApi, shippingApi, SHIPPING_TYPES } from "../services/settingsApi";
import { keys } from "../lib/queryKeys";
import { useToastStore } from "../store/toastStore";
import { useAuth } from "../hooks/useAuth";
import { errorMessage } from "../lib/apiError";
import { splitFormError } from "../lib/formErrors";
import { formatDateTime, formatMoney } from "../lib/format";
import { PageHeader } from "../components/common/PageHeader";
import { FormField } from "../components/common/FormField";
import { Toggle } from "../components/common/Toggle";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";

const inp = "w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-[#00130d] outline-none disabled:bg-slate-50 disabled:text-slate-500";
const btn = "inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50";
const URL_RE = /^https?:\/\/\S+$/i;
const toForm = (s) => ({
  storeName: s.storeName || "", tagline: s.tagline || "",
  contact: { email: s.contact?.email || "", phone: s.contact?.phone || "", whatsapp: s.contact?.whatsapp || "", address: s.contact?.address || "" },
  social: { facebook: s.social?.facebook || "", instagram: s.social?.instagram || "", tiktok: s.social?.tiktok || "", youtube: s.social?.youtube || "" },
  checkout: { guestCheckoutEnabled: s.checkout?.guestCheckoutEnabled !== false, codEnabled: s.checkout?.codEnabled !== false, jazzcashEnabled: Boolean(s.checkout?.jazzcashEnabled) },
  returns: { enabled: s.returns?.enabled !== false, windowDays: s.returns?.windowDays ?? 7 },
  announcement: { enabled: Boolean(s.announcement?.enabled), text: s.announcement?.text || "", link: s.announcement?.link || "" },
});

/* ------------------------------ Shipping rules ----------------------------- */
const RuleEditor = ({ rule, onClose }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const isEdit = Boolean(rule);
  const [f, setF] = useState(() => ({ name: rule?.name || "", type: rule?.type || "flat", flatRate: rule?.flatRate ?? "", minimumOrderAmount: rule?.minimumOrderAmount ?? "", country: rule?.country || "Pakistan", currency: rule?.currency || "PKR", priority: rule?.priority ?? 100, isActive: rule?.isActive ?? true, cityRates: (rule?.cityRates || []).map((c) => ({ city: c.city, rate: c.rate })) }));
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: (b) => (isEdit ? shippingApi.update(rule._id, b) : shippingApi.create(b)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping-rules"] }); addToast(isEdit ? "Shipping rule updated." : "Shipping rule created."); onClose(); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the rule"); setErrors(fields); setGeneral(g); },
  });
  const submit = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = "Name must be at least 2 characters.";
    if (f.type === "flat" && (f.flatRate === "" || Number(f.flatRate) < 0)) e.flatRate = "Enter the flat shipping fee (zero or more).";
    if (f.type === "free_shipping" && (f.minimumOrderAmount === "" || Number(f.minimumOrderAmount) < 0)) e.minimumOrderAmount = "Enter the order amount that unlocks free shipping.";
    if (f.type === "city_based") {
      if (f.cityRates.length === 0) e.cityRates = "Add at least one city rate.";
      else if (f.cityRates.some((c) => !c.city.trim() || c.rate === "" || Number(c.rate) < 0)) e.cityRates = "Every city needs a name and a rate of zero or more.";
      else if (new Set(f.cityRates.map((c) => c.city.trim().toLowerCase())).size !== f.cityRates.length) e.cityRates = "Duplicate cities are not allowed.";
    }
    if (!Number.isInteger(Number(f.priority)) || Number(f.priority) < 0 || Number(f.priority) > 10000) e.priority = "Whole number between 0 and 10000.";
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    const body = { name: f.name.trim(), type: f.type, country: f.country.trim() || "Pakistan", currency: f.currency, priority: Number(f.priority), isActive: f.isActive };
    if (f.type === "flat") body.flatRate = Number(f.flatRate);
    if (f.type === "free_shipping") body.minimumOrderAmount = Number(f.minimumOrderAmount);
    if (f.type === "city_based") body.cityRates = f.cityRates.map((c) => ({ city: c.city.trim(), rate: Number(c.rate) }));
    save.mutate(body);
  };
  return <Modal isOpen onClose={() => !save.isPending && onClose()} title={isEdit ? "Edit shipping rule" : "New shipping rule"} maxWidth="md">
      <div className="space-y-3">
        <FormField label="Rule name" required error={errors.name}><input className={inp} maxLength={120} value={f.name} onChange={set("name")} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Type" required><select className={inp} value={f.type} onChange={set("type")}>{Object.entries(SHIPPING_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></FormField>
          <FormField label="Country" error={errors.country}><input className={inp} value={f.country} onChange={set("country")} /></FormField>
          <FormField label="Currency" hint={f.currency === "USD" ? "All amounts on this rule are in USD and apply only to USD orders. Nothing is converted from PKR." : "All amounts on this rule are in PKR."}><select className={inp} value={f.currency} onChange={set("currency")}><option value="PKR">PKR — Pakistani Rupee</option><option value="USD">USD — US Dollar</option></select></FormField>
        </div>
        {f.type === "flat" && <FormField label={`Flat fee (${f.currency})`} required error={errors.flatRate}><input type="number" min={0} step="0.01" className={inp} value={f.flatRate} onChange={set("flatRate")} /></FormField>}
        {f.type === "free_shipping" && <FormField label={`Free shipping from order amount (${f.currency})`} required error={errors.minimumOrderAmount}><input type="number" min={0} step="0.01" className={inp} value={f.minimumOrderAmount} onChange={set("minimumOrderAmount")} /></FormField>}
        {f.type === "city_based" && <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-800">City rates <span className="text-rose-600">*</span></span>
            {f.cityRates.map((c, i) => <div key={i} className="flex gap-2"><input className={inp} placeholder="City" value={c.city} onChange={(e) => setF((s) => ({ ...s, cityRates: s.cityRates.map((x, n) => (n === i ? { ...x, city: e.target.value } : x)) }))} /><input type="number" min={0} step="0.01" className={`${inp} w-28`} placeholder={`Rate (${f.currency})`} value={c.rate} onChange={(e) => setF((s) => ({ ...s, cityRates: s.cityRates.map((x, n) => (n === i ? { ...x, rate: e.target.value } : x)) }))} /><button type="button" onClick={() => setF((s) => ({ ...s, cityRates: s.cityRates.filter((_, n) => n !== i) }))} className="p-2 text-slate-400 hover:text-rose-600"><X className="w-4 h-4" /></button></div>)}
            <button type="button" onClick={() => setF((s) => ({ ...s, cityRates: [...s.cityRates, { city: "", rate: "" }] }))} className={`${btn} bg-slate-100 text-slate-700`}><Plus className="w-3.5 h-3.5" />Add city</button>
            {errors.cityRates && <p className="text-xs text-rose-600">{errors.cityRates}</p>}
          </div>}
        <div className="grid grid-cols-2 gap-3 items-end">
          <FormField label="Priority" error={errors.priority} hint="Lower number is applied first."><input type="number" min={0} className={inp} value={f.priority} onChange={set("priority")} /></FormField>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 pb-2"><Toggle checked={f.isActive} onChange={(v) => setF((s) => ({ ...s, isActive: v }))} /> Active</label>
        </div>
        {general && <p className="text-xs text-rose-600">{general}</p>}
        <div className="flex justify-end gap-2"><button className={`${btn} bg-slate-100 text-slate-700`} onClick={onClose} disabled={save.isPending}>Cancel</button><button className={`${btn} bg-emerald-800 text-white hover:bg-emerald-700`} onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save rule"}</button></div>
      </div>
    </Modal>;
};

const ShippingTab = ({ canManage }) => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const q = useQuery({ queryKey: ["shipping-rules", "list"], queryFn: () => shippingApi.list({ limit: 100 }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shipping-rules"] });
  const toggle = useMutation({ mutationFn: ({ id, isActive }) => shippingApi.setActive(id, isActive), onSuccess: () => { refresh(); addToast("Rule status updated."); }, onError: (e) => addToast(errorMessage(e, "Could not update the rule"), "error") });
  const remove = useMutation({ mutationFn: (id) => shippingApi.remove(id), onSuccess: () => { refresh(); addToast("Rule deleted."); setRemoving(null); }, onError: (e) => { setRemoving(null); addToast(errorMessage(e, "Could not delete the rule"), "error"); } });
  const summary = (r) => { const cur = { currency: r.currency || "PKR" }; return r.type === "flat" ? formatMoney(r.flatRate, cur) : r.type === "free_shipping" ? `Free from ${formatMoney(r.minimumOrderAmount, cur)}` : `${r.cityRates?.length || 0} cities`; };
  return <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-slate-900">Shipping Rules</h3><p className="text-xs text-slate-500">Checkout shipping is calculated by the backend from these rules. The lowest priority number that matches is applied.</p></div>
        {canManage && <button type="button" className={`${btn} bg-[#00130d] text-white`} onClick={() => setEditor({ rule: null })}><Plus className="w-3.5 h-3.5" />New rule</button>}</div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <LoadingSkeleton rows={3} /> : (q.data?.items || []).length === 0 ? <EmptyState title="No Shipping Rules" description="Without an active rule the backend cannot price delivery at checkout." /> : <div className="space-y-2">
          {q.data.items.map((r) => <div key={r._id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
              <div><div className="font-bold text-slate-900">{r.name}</div><div className="text-slate-500">{SHIPPING_TYPES[r.type]} · {summary(r)} · {r.country} · {r.currency || "PKR"} · priority {r.priority}</div></div>
              <div className="flex items-center gap-3"><StatusBadge status={r.isActive ? "active" : "inactive"} />
                {canManage && <><Toggle checked={r.isActive} disabled={toggle.isPending} onChange={(v) => toggle.mutate({ id: r._id, isActive: v })} /><button type="button" onClick={() => setEditor({ rule: r })} className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg" title="Edit"><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => setRemoving(r)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button></>}</div>
            </div>)}
        </div>}
      {editor && <RuleEditor key={editor.rule?._id || "new"} rule={editor.rule} onClose={() => setEditor(null)} />}
      <ConfirmDialog isOpen={Boolean(removing)} onClose={() => !remove.isPending && setRemoving(null)} onConfirm={() => remove.mutate(removing._id)} isLoading={remove.isPending} title="Delete shipping rule" message={`Delete "${removing?.name}"? Customers can no longer be charged by this rule.`} confirmLabel="Delete" isDestructive />
    </div>;
};

/* --------------------------------- Settings -------------------------------- */
export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const { can, isOwner } = useAuth();
  const canManage = can("settings.manage");
  const [activeTab, setActiveTab] = useState("profile");
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const q = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  useEffect(() => { if (q.data && !form) setForm(toForm(q.data)); }, [q.data, form]);

  const save = useMutation({
    mutationFn: (b) => settingsApi.update(b),
    onSuccess: (updated) => { queryClient.setQueryData(["settings"], updated); setForm(toForm(updated)); addToast("Store settings saved."); setErrors({}); setGeneral(""); },
    onError: (err) => { const { fields, general: g } = splitFormError(err, "Could not save the settings"); setErrors(fields); setGeneral(g); },
  });
  const set = (path) => (e) => { const v = e?.target ? e.target.value : e; const [a, b] = path.split("."); setForm((s) => (b ? { ...s, [a]: { ...s[a], [b]: v } } : { ...s, [a]: v })); };
  const dirty = form && q.data && JSON.stringify(form) !== JSON.stringify(toForm(q.data));

  const submit = (ev) => {
    ev.preventDefault();
    const e = {};
    if (!form.storeName.trim()) e.storeName = "Store name is required.";
    if (form.contact.email && !/^\S+@\S+\.\S+$/.test(form.contact.email)) e["contact.email"] = "Enter a valid email address.";
    for (const k of ["facebook", "instagram", "tiktok", "youtube"]) if (form.social[k] && !URL_RE.test(form.social[k])) e[`social.${k}`] = "Must be a full http(s) URL.";
    const days = Number(form.returns.windowDays);
    if (!Number.isInteger(days) || days < 0 || days > 365) e["returns.windowDays"] = "Whole number of days between 0 and 365.";
    if (form.announcement.link && !(/^\/(?!\/)/.test(form.announcement.link) || URL_RE.test(form.announcement.link))) e["announcement.link"] = 'Use an http(s) URL or a path starting with "/".';
    setErrors(e); setGeneral("");
    if (Object.keys(e).length) return;
    save.mutate({
      storeName: form.storeName.trim(), tagline: form.tagline.trim(),
      contact: Object.fromEntries(Object.entries(form.contact).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v || k !== "email")),
      social: Object.fromEntries(Object.entries(form.social).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
      checkout: form.checkout, returns: { enabled: form.returns.enabled, windowDays: days },
      announcement: { enabled: form.announcement.enabled, text: form.announcement.text.trim(), ...(form.announcement.link.trim() ? { link: form.announcement.link.trim() } : {}) },
    });
  };

  const tabs = [{ id: "profile", label: "Store Profile", icon: Store }, ...(can("shipping.read") ? [{ id: "shipping", label: "Shipping Rules", icon: Truck }] : []), { id: "checkout", label: "Checkout & Returns", icon: CreditCard }, ...(isOwner ? [{ id: "team", label: "Team & Access", icon: Users }] : [])];
  const err = (k) => errors[k];
  const SaveButton = <button type="submit" disabled={save.isPending || !dirty || !canManage} className="inline-flex items-center gap-2 px-5 py-2 bg-[#00130d] text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-sm hover:bg-[#1a2634] transition-colors disabled:opacity-50"><Save className="w-4 h-4" />{save.isPending ? "Saving..." : "Save Settings"}</button>;

  return <div className="space-y-6">
      <PageHeader breadcrumb={[{ label: "System & Insights" }, { label: "Settings" }]} title="Store Configuration & Master Policies" description="Storefront identity, contact details, checkout payment methods, return policy and shipping rules. Gateway credentials are managed on the server and never appear here." />
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-2 flex items-center gap-2 overflow-x-auto">
        {tabs.map((t) => <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${activeTab === t.id ? "bg-[#00130d] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"}`}><t.icon className="w-3.5 h-3.5" />{t.label}</button>)}
      </div>

      {activeTab === "shipping" ? <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6"><ShippingTab canManage={can("shipping.manage")} /></div> : activeTab === "team" ? <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-3 max-w-3xl"><h3 className="text-sm font-bold text-slate-900">Team & Access</h3><p className="text-xs text-slate-500">Staff accounts and their module permissions are managed by the account owner.</p><div className="flex gap-2"><Link to="/staff" className={`${btn} bg-[#00130d] text-white`}>Manage staff</Link><Link to="/audit-logs" className={`${btn} bg-slate-100 text-slate-700`}>View audit log</Link></div></div> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading || !form ? <div className="bg-white rounded-xl border border-slate-200 p-6"><LoadingSkeleton rows={6} /></div> : <form onSubmit={submit} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          {!canManage && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">You have read-only access to settings.</p>}
          <fieldset disabled={!canManage || save.isPending} className="space-y-5 max-w-3xl">
            {activeTab === "profile" && <>
              <div><h3 className="text-sm font-bold text-slate-900">Store identity</h3><p className="text-xs text-slate-500">Shown on the storefront and in customer communications.</p></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Store name" required error={err("storeName")}><input className={inp} maxLength={120} value={form.storeName} onChange={set("storeName")} /></FormField>
                <FormField label="Tagline" error={err("tagline")}><input className={inp} maxLength={200} value={form.tagline} onChange={set("tagline")} /></FormField>
                <FormField label="Currency" hint="Fixed to PKR."><input className={inp} value={q.data.currency || "PKR"} disabled readOnly /></FormField>
              </div>
              <h3 className="text-sm font-bold text-slate-900 pt-2">Contact</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Support email" error={err("contact.email")}><input type="email" className={inp} maxLength={160} value={form.contact.email} onChange={set("contact.email")} /></FormField>
                <FormField label="Support phone" error={err("contact.phone")}><input className={inp} maxLength={30} value={form.contact.phone} onChange={set("contact.phone")} /></FormField>
                <FormField label="WhatsApp" error={err("contact.whatsapp")}><input className={inp} maxLength={30} value={form.contact.whatsapp} onChange={set("contact.whatsapp")} /></FormField>
                <FormField label="Address" error={err("contact.address")}><input className={inp} maxLength={300} value={form.contact.address} onChange={set("contact.address")} /></FormField>
              </div>
              <h3 className="text-sm font-bold text-slate-900 pt-2">Social links</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{["facebook", "instagram", "tiktok", "youtube"].map((k) => <FormField key={k} label={k[0].toUpperCase() + k.slice(1)} error={err(`social.${k}`)}><input className={inp} maxLength={300} placeholder="https://…" value={form.social[k]} onChange={set(`social.${k}`)} /></FormField>)}</div>
              <h3 className="text-sm font-bold text-slate-900 pt-2">Announcement bar</h3>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Toggle checked={form.announcement.enabled} onChange={(v) => set("announcement.enabled")(v)} /> Show on storefront</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><FormField label="Text" error={err("announcement.text")}><input className={inp} maxLength={240} value={form.announcement.text} onChange={set("announcement.text")} /></FormField><FormField label="Link" error={err("announcement.link")}><input className={inp} maxLength={300} value={form.announcement.link} onChange={set("announcement.link")} /></FormField></div>
            </>}
            {activeTab === "checkout" && <>
              <div><h3 className="text-sm font-bold text-slate-900">Payment methods at checkout</h3><p className="text-xs text-slate-500">PEHAN LY supports Cash on Delivery and JazzCash. Gateway credentials are server-side secrets and are not editable here.</p></div>
              {[["codEnabled", "Cash on Delivery", "Customers pay the courier on delivery."], ["jazzcashEnabled", "JazzCash", "Online payment through the JazzCash gateway (requires server credentials)."], ["guestCheckoutEnabled", "Guest checkout", "Allow orders without a customer account."]].map(([k, label, hint]) => <div key={k} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200"><div><div className="text-xs font-bold text-slate-900">{label}</div><div className="text-[11px] text-slate-500">{hint}</div></div><Toggle checked={form.checkout[k]} onChange={(v) => set(`checkout.${k}`)(v)} /></div>)}
              <h3 className="text-sm font-bold text-slate-900 pt-2">Returns policy</h3>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200"><div><div className="text-xs font-bold text-slate-900">Accept return requests</div><div className="text-[11px] text-slate-500">When off, customers cannot open new return requests.</div></div><Toggle checked={form.returns.enabled} onChange={(v) => set("returns.enabled")(v)} /></div>
              <FormField label="Return window (days after delivery)" error={err("returns.windowDays")}><input type="number" min={0} max={365} className={`${inp} max-w-[160px]`} value={form.returns.windowDays} onChange={set("returns.windowDays")} /></FormField>
            </>}
          </fieldset>
          {general && <p className="text-xs text-rose-600">{general}</p>}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between"><span className="text-xs text-slate-400">{q.data.updatedAt ? `Last updated ${formatDateTime(q.data.updatedAt)}` : "Not changed yet"}</span>{SaveButton}</div>
        </form>}
    </div>;
};
