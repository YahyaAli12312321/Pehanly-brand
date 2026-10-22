import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { PageLoader } from "../common/PageLoader";
import { ErrorState } from "../common/ErrorState";
import { EmptyState } from "../common/EmptyState";

/** Everything below requires a signed-in back-office user (admin or staff). */
export const RequireAuth = () => {
  const { user, isLoading, isError, error, refetch, logout } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen bg-[#f8f9ff]"><PageLoader label="Checking your session..." /></div>;
  if (isError) return <div className="min-h-screen bg-[#f8f9ff] p-8"><ErrorState error={error} onRetry={refetch} title="Couldn't verify your session" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.role !== "admin" && user.role !== "staff") {
    return <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
        <EmptyState
      icon={<ShieldAlert className="w-6 h-6" />}
      title="This account can't use the admin dashboard"
      description="Only owner and staff accounts can sign in here."
      action={<button type="button" onClick={() => logout()} className="px-4 py-2 rounded-lg bg-[#0f2922] text-white text-xs font-semibold hover:bg-[#1a3d34]">Sign out</button>}
    />
      </div>;
  }
  return <Outlet />;
};

/** Forbidden screen used by route-level permission checks. */
export const ForbiddenPage = ({ what = "this page" }) => <div className="py-10">
    <EmptyState
  icon={<ShieldAlert className="w-6 h-6" />}
  title="You don't have access"
  description={`Your account isn't allowed to open ${what}. Ask the store owner to grant the permission.`}
/>
  </div>;

/**
 * Route-level gate: <Route element={<RequirePermission permission="orders.read" />}> ... </Route>
 * UX only - the API enforces the same rule.
 */
export const RequirePermission = ({ permission, ownerOnly = false, what }) => {
  const { can, isOwner } = useAuth();
  const allowed = ownerOnly ? isOwner : permission ? can(permission) : true;
  return allowed ? <Outlet /> : <ForbiddenPage what={what} />;
};

/** Inline gate for buttons/sections. */
export const Can = ({ permission, ownerOnly = false, fallback = null, children }) => {
  const { can, isOwner } = useAuth();
  const allowed = ownerOnly ? isOwner : can(permission);
  return allowed ? children : fallback;
};
