import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { matchRoute } from '../routes';
import { registerNavigator, useAppStore } from '../store/useAppStore';

/**
 * Bridges react-router with the legacy `navigate(route, params)` store API:
 *  - registers the router's navigate function for the store
 *  - mirrors the URL into `currentRoute` / `routeParams`
 *  - resets scroll and moves focus to the main landmark on page change
 */
export default function RouterBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const setRouteState = useAppStore((s) => s.setRouteState);
  const first = useRef(true);

  useEffect(() => {
    registerNavigator((to) => navigate(to));
  }, [navigate]);

  useEffect(() => {
    const { route, params } = matchRoute(location.pathname);
    setRouteState(route, params);

    if (first.current) {
      first.current = false;
      return;
    }
    if (!location.hash) window.scrollTo({ top: 0, left: 0 });
    const main = document.getElementById('main-content');
    if (main) main.focus({ preventScroll: true });
  }, [location.pathname, location.hash, setRouteState]);

  return null;
}
