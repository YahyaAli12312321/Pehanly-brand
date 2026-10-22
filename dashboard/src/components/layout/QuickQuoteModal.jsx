import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "../../store/uiStore";
import { useAuth } from "../../hooks/useAuth";
import { Modal } from "../common/Modal";
import { LoadingSkeleton } from "../common/LoadingSkeleton";
import { ErrorState } from "../common/ErrorState";
import { CreateQuoteModal } from "../quotes/CreateQuoteModal";
import { wholesaleApi } from "../../services/wholesaleApi";
import { manufacturingApi } from "../../services/manufacturingApi";
import { printingApi } from "../../services/printingApi";
import { formatNumber } from "../../lib/format";

const SOURCES = {
  wholesale: { label: "Wholesale", list: (p) => wholesaleApi.listRequests(p), perm: "wholesale.read" },
  manufacturing: { label: "Manufacturing", list: (p) => manufacturingApi.listRequests(p), perm: "manufacturing.read" },
  printing: { label: "Printing & Branding", list: (p) => printingApi.listRequests(p), perm: "printing.read" },
};

/**
 * The backend only creates quotes from an APPROVED customer request (wholesale / manufacturing / printing),
 * so this dialog lists approved requests that have no quote yet and opens the real quote form for the chosen one.
 */
export const QuickQuoteModal = () => {
  const { newQuoteModalOpen, setNewQuoteModalOpen } = useUIStore();
  const { can } = useAuth();
  const navigate = useNavigate();
  const available = Object.entries(SOURCES).filter(([, s]) => can(s.perm));
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState(null);
  const active = source && SOURCES[source] ? source : available[0]?.[0];

  const q = useQuery({
    queryKey: ["quotes", "quotable", active],
    queryFn: async () => (await SOURCES[active].list({ status: "approved", limit: 50 })).items.filter((r) => !r.quote),
    enabled: newQuoteModalOpen && !!active && !picked,
  });
  const close = () => { setNewQuoteModalOpen(false); setPicked(null); };

  if (picked) return <CreateQuoteModal sourceType={active} requestId={picked._id} requestNumber={picked.requestNumber} quantity={active === "wholesale" ? undefined : picked.quantity} onClose={close} onCreated={(qt) => navigate(`/quotes/${qt._id}`)} />;
  return <Modal isOpen={newQuoteModalOpen} onClose={close} title="Create a quote" subtitle="Quotes are built from an approved customer request." maxWidth="md">
      {!can("quotes.manage") ? <p className="text-xs text-slate-500">You need the Quotes management permission to create quotes.</p> : available.length === 0 ? <p className="text-xs text-slate-500">You need access to Wholesale, Manufacturing or Printing requests to start a quote.</p> : <div className="space-y-3">
          <div className="flex gap-2">{available.map(([id, s]) => <button key={id} onClick={() => setSource(id)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${active === id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{s.label}</button>)}</div>
          {q.isLoading ? <LoadingSkeleton rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (q.data || []).length === 0 ? <p className="text-xs text-slate-500 py-6 text-center">No approved {SOURCES[active].label.toLowerCase()} requests are waiting for a quote. Approve a request first.</p> : <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
              {q.data.map((r) => <li key={r._id}><button onClick={() => setPicked(r)} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex justify-between gap-3 text-xs"><span><span className="font-mono font-bold">{r.requestNumber}</span><span className="block text-slate-500">{r.customer?.businessName || r.customer?.name}</span></span><span className="font-mono text-slate-600">{r.quantity ?? r.requestedVolume ? `${formatNumber(r.quantity ?? r.requestedVolume)} pcs` : ""}</span></button></li>)}
            </ul>}
        </div>}
    </Modal>;
};
