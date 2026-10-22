import { createContext, createElement, useContext, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/authApi';
import { setUnauthorizedHandler } from '../lib/apiClient';
import { keys } from '../lib/queryKeys';
import { setAuthNotice } from '../lib/authNotice';
import { can, isBackOffice, isOwner } from '../lib/permissions';
import { useToastStore } from '../store/toastStore';

const AuthContext = createContext(null);

/**
 * Switch the session identity (sign in / sign out / expired) WITHOUT dropping the `me` query itself.
 * queryClient.clear() would detach the mounted observers from the query, so the UI would keep showing
 * the previous user. Everything else is removed so no data from the old session survives.
 */
function resetSession(queryClient, nextUser) {
  const meKey = JSON.stringify(keys.auth.me);
  queryClient.removeQueries({ predicate: (q) => JSON.stringify(q.queryKey) !== meKey });
  queryClient.setQueryData(keys.auth.me, nextUser);
}

/**
 * Session state. The signed-in user is SERVER state (GET /auth/me), so it lives in
 * React Query - not Zustand, and never in localStorage. `null` = signed out.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);

  const meQuery = useQuery({
    queryKey: keys.auth.me,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err.status === 401) return null; // signed out is a normal answer, not an error
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  // A request on a signed-in session came back 401 => the session expired or was revoked.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (queryClient.getQueryData(keys.auth.me)) {
        setAuthNotice('expired');
        resetSession(queryClient, null);
        addToast('Your session has expired. Please sign in again.', 'info', 'Signed out');
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, addToast]);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      resetSession(queryClient, user);
    },
  });

  /**
   * Public registration. Flow: POST /auth/register -> GET /auth/me (the real session/role) -> decide.
   * The dashboard session is kept ONLY when the backend reports a back-office role for the new account
   * (the first admin). Any other result (a customer account) is signed out again. The browser never decides.
   */
  const registerMutation = useMutation({
    mutationFn: async (body) => {
      await authApi.register(body);
      let me = null;
      try {
        me = await authApi.me();
      } catch {
        me = null;
      }
      const dashboardAccess = isBackOffice(me);
      if (!dashboardAccess) {
        try {
          await authApi.logout();
        } catch {
          /* the dashboard still treats a non-back-office session as signed out */
        }
      }
      return { user: dashboardAccess ? me : null, role: me?.role ?? 'customer', dashboardAccess };
    },
    onSuccess: ({ user }) => {
      resetSession(queryClient, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      resetSession(queryClient, null);
    },
  });

  const user = meQuery.data ?? null;

  const value = useMemo(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      isError: meQuery.isError,
      error: meQuery.error,
      refetch: meQuery.refetch,
      isAuthenticated: Boolean(user),
      isBackOffice: isBackOffice(user),
      isOwner: isOwner(user),
      can: (permission) => can(user, permission),
      login: loginMutation.mutateAsync,
      isLoggingIn: loginMutation.isPending,
      register: registerMutation.mutateAsync,
      isRegistering: registerMutation.isPending,
      logout: logoutMutation.mutateAsync,
      isLoggingOut: logoutMutation.isPending,
    }),
    [user, meQuery.isLoading, meQuery.isError, meQuery.error, meQuery.refetch, loginMutation.mutateAsync, loginMutation.isPending, registerMutation.mutateAsync, registerMutation.isPending, logoutMutation.mutateAsync, logoutMutation.isPending],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
