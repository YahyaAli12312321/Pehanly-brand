import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { catalogApi, reviewsApi, contentApi } from '../services/catalogApi';
import { authApi, accountApi, ordersApi, checkoutApi, returnsApi } from '../services/accountApi';
import { wholesaleApi, manufacturingApi, printingApi, quotesApi, mediaApi } from '../services/b2bApi';
import { ApiError, onUnauthorized } from '../services/http';
import { useAppStore } from '../store/useAppStore';

const MIN = 60 * 1000;

export const QUERY_KEYS = {
  session: ['session'],
  categories: (params) => ['catalog', 'categories', params || {}],
  products: (params) => ['catalog', 'products', params || {}],
  product: (slug) => ['catalog', 'product', slug],
  reviewSummary: (id) => ['reviews', 'summary', id],
  reviews: (id, params) => ['reviews', 'list', id, params || {}],
  banners: (placement) => ['banners', placement],
  settings: ['settings', 'public'],
  freeShipping: (currency = 'PKR') => ['shipping', 'free', currency],
  shipping: (subtotal, city) => ['shipping', 'quote', subtotal, city],
  profile: ['account', 'profile'],
  addresses: ['account', 'addresses'],
  orders: (params) => ['orders', 'mine', params || {}],
  order: (id) => ['orders', 'one', id],
  wholesalePacks: ['wholesale', 'packs'],
  wholesalePack: (slug) => ['wholesale', 'pack', slug],
  wholesaleMine: ['wholesale', 'mine'],
  mfgCategories: ['manufacturing', 'categories'],
  mfgCategory: (slug) => ['manufacturing', 'category', slug],
  mfgStyles: (categoryId) => ['manufacturing', 'styles', categoryId],
  mfgVariants: (styleId) => ['manufacturing', 'variants', styleId],
  mfgMine: ['manufacturing', 'mine'],
  printServices: ['printing', 'services'],
  printMine: ['printing', 'mine'],
  quotesMine: ['quotes', 'mine'],
  returnsMine: ['returns', 'mine'],
};

/* ------------------------------ session ------------------------------ */

/** Mount once: restores the cookie session and reacts to server-side 401s. */
export function useSessionBootstrap() {
  const setUser = useAppStore((s) => s.setUser);
  const clearSession = useAppStore((s) => s.clearSession);
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    // Only a 401/403 means "not signed in". A cold-starting or briefly unavailable API (network error,
    // timeout, 5xx) must not look like a sign-out, so those are retried before giving up.
    const restore = async () => {
      for (let attempt = 0; attempt < SESSION_RESTORE_ATTEMPTS; attempt += 1) {
        try {
          const data = await authApi.me();
          if (!cancelled) setUser(data?.user || null);
          return;
        } catch (err) {
          if (cancelled) return;
          if (!isTransientSessionError(err) || attempt === SESSION_RESTORE_ATTEMPTS - 1) return clearSession();
          await new Promise((resolve) => setTimeout(resolve, SESSION_RESTORE_DELAYS[attempt]));
        }
      }
    };
    restore();
    const off = onUnauthorized(() => {
      clearSession();
      queryClient.removeQueries({ queryKey: ['account'] });
      queryClient.removeQueries({ queryKey: ['orders'] });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [setUser, clearSession, queryClient]);
}

export const SESSION_RESTORE_ATTEMPTS = 4;
export const SESSION_RESTORE_DELAYS = [1500, 3000, 6000];
/** Network failure, timeout or 5xx: says nothing about whether the customer is signed in. */
export const isTransientSessionError = (err) => !err?.status || err.status >= 500 || err.status === 429;

/** Signs in, then confirms the browser really kept the HttpOnly session cookie (GET /auth/me). */
export async function loginAndVerify(body) {
  const data = await authApi.login(body);
  try {
    const me = await authApi.me();
    return { user: me?.user || data?.user || null };
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      throw new ApiError({
        message:
          'You were signed in, but your browser did not keep the session. Allow cookies for this site (and, in private or strict-privacy modes, allow third-party cookies), then try again. If it keeps happening, contact support.',
        status: 401,
        code: 'SESSION_NOT_PERSISTED',
      });
    }
    return { user: data?.user || null }; // /auth/me unreachable for another reason: trust the successful login
  }
}

export function useLoginMutation() {
  const setUser = useAppStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body) => loginAndVerify(body),
    onSuccess: (data) => setUser(data?.user || null),
  });
}

export function useRegisterMutation() {
  const setUser = useAppStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body) => authApi.register(body),
    onSuccess: (data) => setUser(data?.user || null),
  });
}

export function useLogoutMutation() {
  const clearSession = useAppStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearSession();
      ['account', 'orders', 'wholesale', 'manufacturing', 'printing', 'quotes', 'returns'].forEach((k) =>
        queryClient.removeQueries({ queryKey: [k] }),
      );
    },
  });
}

export const useForgotPasswordMutation = () => useMutation({ mutationFn: (body) => authApi.forgotPassword(body) });
export const useResetPasswordMutation = () => useMutation({ mutationFn: (body) => authApi.resetPassword(body) });

/* ------------------------------ catalog ------------------------------ */

export const useCategoriesQuery = (params) =>
  useQuery({ queryKey: QUERY_KEYS.categories(params), queryFn: () => catalogApi.categories(params), staleTime: 10 * MIN });

export const useProductsQuery = (params, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.products(params),
    queryFn: () => catalogApi.products(params),
    staleTime: 2 * MIN,
    placeholderData: keepPreviousData,
    ...options,
  });

export const useProductQuery = (slug, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.product(slug),
    queryFn: () => catalogApi.product(slug),
    enabled: Boolean(slug),
    staleTime: MIN,
    retry: (count, error) => error?.status !== 404 && count < 1,
    ...options,
  });

export const useReviewSummaryQuery = (productId) =>
  useQuery({
    queryKey: QUERY_KEYS.reviewSummary(productId),
    queryFn: () => reviewsApi.summary(productId),
    enabled: Boolean(productId),
    staleTime: 5 * MIN,
  });

export const useReviewsQuery = (productId, params) =>
  useQuery({
    queryKey: QUERY_KEYS.reviews(productId, params),
    queryFn: () => reviewsApi.list(productId, params),
    enabled: Boolean(productId),
    staleTime: 5 * MIN,
  });

export const useBannersQuery = (placement, limit) =>
  useQuery({ queryKey: QUERY_KEYS.banners(placement), queryFn: () => contentApi.banners(placement, limit), staleTime: 5 * MIN });

export const usePublicSettingsQuery = () =>
  useQuery({ queryKey: QUERY_KEYS.settings, queryFn: () => contentApi.publicSettings(), staleTime: 5 * MIN });

/* ---------------------- shipping / coupon / checkout ---------------------- */

export const useFreeShippingInfoQuery = (currency = 'PKR') =>
  useQuery({
    queryKey: QUERY_KEYS.freeShipping(currency),
    // The threshold always comes from backend shipping rules for THIS currency - never converted in the browser.
    queryFn: () => checkoutApi.freeShippingInfo(currency),
    staleTime: 5 * MIN,
    retry: false,
  });

export const useShippingQuoteQuery = ({ subtotal, city, currency = 'PKR', country = 'Pakistan' }, options = {}) =>
  useQuery({
    queryKey: [...QUERY_KEYS.shipping(subtotal, (city || '').trim().toLowerCase()), currency, country],
    queryFn: () => checkoutApi.shipping({ subtotal, city: city.trim(), country: country || 'Pakistan', ...(currency !== 'PKR' ? { currency } : {}) }),
    enabled: Boolean(city && city.trim().length >= 2) && Number.isFinite(subtotal),
    staleTime: MIN,
    retry: false,
    ...options,
  });

/**
 * Backend answer for one delivery address: is it deliverable, what does delivery cost (ShippingRule) and
 * which payment methods apply (COD: Karachi only; JazzCash wallet: where the store enabled it).
 * The order endpoint enforces the same rules again, so this is guidance, not the authority.
 */
export const useCheckoutOptionsQuery = ({ subtotal, city, province, country = 'Pakistan', currency = 'PKR' }, options = {}) =>
  useQuery({
    queryKey: ['checkout', 'options', Math.round((subtotal || 0) * 100), (city || '').trim().toLowerCase(), province || '', country, currency],
    queryFn: () =>
      checkoutApi.options({
        subtotal,
        city: city.trim(),
        country: country || 'Pakistan',
        ...(province ? { province } : {}),
        ...(currency !== 'PKR' ? { currency } : {}),
      }),
    enabled: Boolean(city && city.trim().length >= 2) && Number.isFinite(subtotal),
    staleTime: 30 * 1000,
    retry: false,
    placeholderData: (prev) => prev,
    ...options,
  });

export const useValidateCouponMutation = () => useMutation({ mutationFn: (body) => checkoutApi.validateCoupon(body) });

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => ordersApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export const useTrackGuestOrderMutation = () => useMutation({ mutationFn: (body) => ordersApi.trackGuest(body) });

/* ------------------------------- account ------------------------------- */

const useAuthed = () => useAppStore((s) => s.isAuthenticated);

export const useProfileQuery = () => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.profile, queryFn: () => accountApi.profile(), enabled: authed, staleTime: 5 * MIN });
};

export const useUpdateProfileMutation = () => {
  const queryClient = useQueryClient();
  const setUser = useAppStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body) => accountApi.updateProfile(body),
    onSuccess: (data) => {
      if (data?.user || data?._id) setUser(data.user || data);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profile });
    },
  });
};

export const useChangePasswordMutation = () => useMutation({ mutationFn: (body) => accountApi.changePassword(body) });
export const useLogoutOthersMutation = () => useMutation({ mutationFn: () => accountApi.logoutOthers() });

export const useAddressesQuery = () => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.addresses, queryFn: () => accountApi.addresses(), enabled: authed, staleTime: 2 * MIN });
};

export function useAddressMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.addresses });
  return {
    add: useMutation({ mutationFn: (body) => accountApi.addAddress(body), onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, body }) => accountApi.updateAddress(id, body), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id) => accountApi.deleteAddress(id), onSuccess: invalidate }),
  };
}

export const useMyOrdersQuery = (params) => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.orders(params), queryFn: () => ordersApi.mine(params), enabled: authed, staleTime: MIN });
};

export const useMyOrderQuery = (id) => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.order(id), queryFn: () => ordersApi.one(id), enabled: authed && Boolean(id), staleTime: MIN });
};

export function useCancellationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => ordersApi.requestCancellation(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export const useQuotesQuery = () => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.quotesMine, queryFn: () => quotesApi.mine(), enabled: authed, staleTime: MIN });
};

export function useQuoteActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['quotes'] });
  return {
    accept: useMutation({ mutationFn: (id) => quotesApi.accept(id), onSuccess: invalidate }),
    reject: useMutation({ mutationFn: ({ id, customerNotes }) => quotesApi.reject(id, customerNotes ? { customerNotes } : {}), onSuccess: invalidate }),
  };
}

export const useMyRequestsQuery = (kind) => {
  const authed = useAuthed();
  const map = {
    wholesale: [QUERY_KEYS.wholesaleMine, wholesaleApi.mine],
    manufacturing: [QUERY_KEYS.mfgMine, manufacturingApi.mine],
    printing: [QUERY_KEYS.printMine, printingApi.mine],
  };
  const [queryKey, queryFn] = map[kind];
  return useQuery({ queryKey, queryFn: () => queryFn(), enabled: authed, staleTime: MIN });
};

export function useReturnRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, body }) => returnsApi.request(orderId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.returnsMine }),
  });
}

export const useReturnsQuery = () => {
  const authed = useAuthed();
  return useQuery({ queryKey: QUERY_KEYS.returnsMine, queryFn: () => returnsApi.mine(), enabled: authed, staleTime: MIN });
};

/* --------------------- wholesale / manufacturing / printing --------------------- */

export const useWholesalePacksQuery = () =>
  useQuery({ queryKey: QUERY_KEYS.wholesalePacks, queryFn: () => wholesaleApi.packs({ limit: 24 }), staleTime: 5 * MIN });

export const useWholesalePackQuery = (slug) =>
  useQuery({ queryKey: QUERY_KEYS.wholesalePack(slug), queryFn: () => wholesaleApi.pack(slug), enabled: Boolean(slug), staleTime: 5 * MIN });

export const useWholesaleCatalogQuery = (enabled = true) =>
  useQuery({ queryKey: ['wholesale', 'catalog'], queryFn: wholesaleApi.catalog, enabled, staleTime: 2 * MIN });

/** Backend-authoritative price/MOQ/tier/total preview for the wholesale cart. */
export const useWholesalePreviewQuery = (items, enabled = true) =>
  useQuery({
    queryKey: ['wholesale', 'preview', items],
    queryFn: () => wholesaleApi.preview(items),
    enabled: enabled && items.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 0,
    retry: false,
  });

export function useWholesaleRequestMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wholesaleMine });
  return {
    pack: useMutation({ mutationFn: ({ packId, body }) => wholesaleApi.requestPack(packId, body), onSuccess: invalidate }),
    custom: useMutation({ mutationFn: (body) => wholesaleApi.requestCustom(body), onSuccess: invalidate }),
  };
}

export const useManufacturingCategoriesQuery = () =>
  useQuery({ queryKey: QUERY_KEYS.mfgCategories, queryFn: () => manufacturingApi.categories(), staleTime: 30 * 1000 });

export const useManufacturingCategoryQuery = (slug) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgCategory(slug),
    queryFn: () => manufacturingApi.category(slug),
    enabled: Boolean(slug),
    staleTime: 30 * 1000,
    retry: (count, error) => error?.status !== 404 && count < 1,
  });

export const useManufacturingStylesQuery = (categoryId) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgStyles(categoryId),
    queryFn: () => manufacturingApi.styles(categoryId),
    enabled: Boolean(categoryId),
    staleTime: 30 * 1000,
  });

export const useManufacturingVariantsQuery = (styleId) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgVariants(styleId),
    queryFn: () => manufacturingApi.variants(styleId),
    enabled: Boolean(styleId),
    staleTime: 30 * 1000,
  });

export function useManufacturingRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => manufacturingApi.request(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mfgMine }),
  });
}

export const usePrintingServicesQuery = () =>
  useQuery({ queryKey: QUERY_KEYS.printServices, queryFn: () => printingApi.services(), staleTime: 10 * MIN });

export function usePrintingRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => printingApi.request(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.printMine }),
  });
}

export const useUploadMediaMutation = () => useMutation({ mutationFn: ({ file, purpose }) => mediaApi.upload(file, purpose) });
