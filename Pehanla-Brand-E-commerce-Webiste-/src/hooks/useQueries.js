import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { catalogApi, reviewsApi, contentApi } from '../services/catalogApi';
import { authApi, accountApi, ordersApi, checkoutApi, returnsApi } from '../services/accountApi';
import { wholesaleApi, manufacturingApi, printingApi, quotesApi, mediaApi } from '../services/b2bApi';
import { onUnauthorized } from '../services/http';
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
    authApi
      .me()
      .then((data) => !cancelled && setUser(data?.user || null))
      .catch(() => !cancelled && clearSession());
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

export function useLoginMutation() {
  const setUser = useAppStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body) => authApi.login(body),
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

export function useWholesaleRequestMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wholesaleMine });
  return {
    pack: useMutation({ mutationFn: ({ packId, body }) => wholesaleApi.requestPack(packId, body), onSuccess: invalidate }),
    custom: useMutation({ mutationFn: (body) => wholesaleApi.requestCustom(body), onSuccess: invalidate }),
  };
}

export const useManufacturingCategoriesQuery = () =>
  useQuery({ queryKey: QUERY_KEYS.mfgCategories, queryFn: () => manufacturingApi.categories(), staleTime: 10 * MIN });

export const useManufacturingCategoryQuery = (slug) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgCategory(slug),
    queryFn: () => manufacturingApi.category(slug),
    enabled: Boolean(slug),
    staleTime: 10 * MIN,
    retry: (count, error) => error?.status !== 404 && count < 1,
  });

export const useManufacturingStylesQuery = (categoryId) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgStyles(categoryId),
    queryFn: () => manufacturingApi.styles(categoryId),
    enabled: Boolean(categoryId),
    staleTime: 10 * MIN,
  });

export const useManufacturingVariantsQuery = (styleId) =>
  useQuery({
    queryKey: QUERY_KEYS.mfgVariants(styleId),
    queryFn: () => manufacturingApi.variants(styleId),
    enabled: Boolean(styleId),
    staleTime: 10 * MIN,
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
