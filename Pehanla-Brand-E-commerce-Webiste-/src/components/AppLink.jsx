import React from 'react';
import { Link } from 'react-router-dom';
import { buildPath } from '../routes';

/**
 * Crawlable, accessible internal link. Renders a real <a href> (so SEO,
 * middle-click and "open in new tab" work) and navigates client-side.
 * Use `route` + `params` (original route keys) or `to` (a path).
 */
export default function AppLink({ route, params, to, children, ...rest }) {
  const target = to || buildPath(route, params);
  return (
    <Link to={target} {...rest}>
      {children}
    </Link>
  );
}
