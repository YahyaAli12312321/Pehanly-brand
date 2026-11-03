import { Factory, Layers, Lock, ShieldCheck } from "lucide-react";

/**
 * Split auth layout (Stitch "Admin Login" reference).
 *   >= lg : dark brand panel LEFT, auth card RIGHT
 *   md    : reduced brand panel on top (no cards / footer), card below
 *   < md  : compact branding bar on top, the form comes first
 * Nothing here is a live status: no version, IP, TLS or "systems normal" text.
 */

const gridBg = {
  backgroundImage:
    "linear-gradient(rgba(120,200,160,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,200,160,0.06) 1px, transparent 1px)",
  backgroundSize: "36px 36px"
};

const Logo = ({ compact = false }) => <div className="flex items-center gap-3">
    <div aria-hidden="true" className="w-10 h-10 rounded-lg bg-[#0b1f19] border border-white/10 flex items-center justify-center text-white font-bold text-sm tracking-wide shadow-inner">PL</div>
    <div className="leading-tight">
      <div className="flex items-center gap-2">
        <span className="text-white font-bold tracking-wide text-sm">PEHAN LY</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-400/15 text-emerald-300 text-[9px] font-bold tracking-[0.14em] border border-emerald-300/20">PK OPS</span>
      </div>
      {!compact && <span className="text-[10px] tracking-[0.16em] text-slate-400 font-medium">WEAR YOUR IDENTITY</span>}
    </div>
  </div>;

const FeatureCard = ({ icon: Icon, title, children }) => <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
    <div className="flex items-center gap-2 text-white text-[11px] font-bold tracking-[0.12em]">
      <Icon className="w-4 h-4 text-emerald-300" aria-hidden="true" />
      {title}
    </div>
    <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{children}</p>
  </div>;

export const AuthShell = ({ children }) => <div className="min-h-screen flex flex-col lg:flex-row bg-[#f8f9ff] text-[#0b1c30] font-sans">
    <aside
  className="relative overflow-hidden bg-[#06140f] text-white lg:w-[42%] lg:min-h-screen lg:shrink-0 flex flex-col px-5 py-4 md:px-10 md:py-8 lg:px-10 lg:py-9"
  style={gridBg}
>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-black/40" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3">
        <Logo compact={false} />
        <span className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
          SECURE CONSOLE
        </span>
      </div>

      <div className="relative mt-5 hidden md:block lg:mt-14">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          Internal Admin Portal
        </span>
        <h2 className="mt-5 text-3xl lg:text-[34px] font-extrabold leading-[1.15] tracking-tight max-w-md">
          Crafting Pakistani Apparel with Industrial Precision.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-400 max-w-md">
          Manage your store, orders, inventory, B2B wholesale pipelines, and custom manufacturing operations from one unified console.
        </p>
      </div>

      <div className="relative mt-auto hidden lg:grid grid-cols-2 gap-3 pt-10">
        <FeatureCard icon={Layers} title="OMNICHANNEL RETAIL">
          Retail orders, SKU stock reservations and fulfilment tracking in one place.
        </FeatureCard>
        <FeatureCard icon={Factory} title="B2B MANUFACTURING">
          RFQ-to-quote workflow for wholesale knitwear, screen print and custom embroidery.
        </FeatureCard>
      </div>

      <p className="relative mt-6 hidden lg:flex items-center gap-2 text-[11px] text-slate-400">
        <Lock className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
        Restricted Portal. Authorized PEHAN LY Staff Only.
      </p>
    </aside>

    <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-4 pt-6 pb-8 sm:px-6 lg:px-10 bg-gradient-to-b from-[#eef3ff] via-[#f8f9ff] to-[#f8f9ff] lg:bg-[#f8f9ff]">
      <div className="w-full max-w-[440px]">{children}</div>
    </main>
  </div>;

/** White rounded auth card used by login / forgot / reset. */
export const AuthCard = ({ title, subtitle, badge, children, footer }) => <section className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-[0_10px_40px_-12px_rgba(15,41,34,0.18)] p-6 sm:p-8">
    <div className="flex items-start justify-between gap-3">
      <h1 className="text-xl sm:text-[22px] font-extrabold tracking-tight text-[#0b1c30]">{title}</h1>
      {badge && <span className="mt-1 shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          {badge}
        </span>}
    </div>
    {subtitle && <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>}
    <div className="mt-6">{children}</div>
    {footer && <div className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">{footer}</div>}
  </section>;

export const authInput = "w-full h-11 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f2922]/30 focus:border-[#0f2922] disabled:opacity-60";
export const authButton = "w-full h-12 rounded-xl bg-[#0f2922] text-white text-sm font-semibold flex items-center justify-center gap-2 transition hover:bg-[#16382f] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0f2922] disabled:opacity-50 disabled:cursor-not-allowed";
