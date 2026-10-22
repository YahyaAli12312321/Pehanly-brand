import { http, getData, getList } from './http';

export const wholesaleApi = {
  packs: (params) => getList(http.get('/wholesale/packs', { params })),
  pack: (slug) => getData(http.get(`/wholesale/packs/${encodeURIComponent(slug)}`)),
  requestPack: (packId, body) => getData(http.post(`/wholesale/packs/${packId}/request`, body)),
  requestCustom: (body) => getData(http.post('/wholesale/requests/custom', body)),
  mine: (params) => getList(http.get('/wholesale/my', { params })),
};

export const manufacturingApi = {
  categories: () => getData(http.get('/manufacturing/categories')),
  category: (slug) => getData(http.get(`/manufacturing/categories/${encodeURIComponent(slug)}`)),
  styles: (categoryId) => getData(http.get(`/manufacturing/categories/${categoryId}/styles`)),
  style: (slug) => getData(http.get(`/manufacturing/styles/${encodeURIComponent(slug)}`)),
  variants: (styleId) => getData(http.get(`/manufacturing/styles/${styleId}/variants`)),
  request: (body) => getData(http.post('/manufacturing/requests', body)),
  mine: (params) => getList(http.get('/manufacturing/my', { params })),
};

export const printingApi = {
  services: () => getData(http.get('/printing/services')),
  service: (id) => getData(http.get(`/printing/services/${id}`)),
  request: (body) => getData(http.post('/printing/requests', body)),
  mine: (params) => getList(http.get('/printing/my', { params })),
};

export const quotesApi = {
  mine: (params) => getList(http.get('/quotes/my', { params })),
  one: (id) => getData(http.get(`/quotes/my/${id}`)),
  accept: (id) => getData(http.patch(`/quotes/my/${id}/accept`)),
  reject: (id, body = {}) => getData(http.patch(`/quotes/my/${id}/reject`, body)),
};

export const mediaApi = {
  upload: (file, purpose) => {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', purpose);
    return getData(http.post('/media', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
  mine: () => getData(http.get('/media/mine')),
};
