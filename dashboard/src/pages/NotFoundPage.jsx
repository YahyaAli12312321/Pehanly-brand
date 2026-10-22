import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";

export const NotFoundPage = () => <div className="py-10">
    <EmptyState
  icon={<Compass className="w-6 h-6" />}
  title="Page not found"
  description="The page you're looking for doesn't exist or has moved."
  action={<Link to="/" className="inline-flex px-4 py-2 rounded-lg bg-[#0f2922] text-white text-xs font-semibold hover:bg-[#1a3d34]">Back to dashboard</Link>}
/>
  </div>;
