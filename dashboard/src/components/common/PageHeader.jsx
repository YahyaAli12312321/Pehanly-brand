import React from "react";
export const PageHeader = ({
  breadcrumb,
  title,
  description,
  badge,
  actions
}) => {
  return <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div className="flex flex-col gap-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider">
          {breadcrumb.map((item, idx) => <React.Fragment key={idx}>
              {idx > 0 && <span className="text-slate-300">/</span>}
              {idx === breadcrumb.length - 1 ? <span className="text-slate-900 font-semibold">{item.label}</span> : <span className="hover:text-slate-900 transition-colors">{item.label}</span>}
            </React.Fragment>)}
        </nav>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-sans">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-sm text-slate-500 leading-relaxed">{description}</p>}
      </div>

      {actions && <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0 flex-wrap">
          {actions}
        </div>}
    </div>;
};
