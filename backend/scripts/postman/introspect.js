'use strict';

/*
 * Reads the LIVE Express router and returns one record per route:
 *   { method, path, guards, schemas, multipart, handlerSource }
 * Nothing here is hand-maintained, so the Postman collection cannot list a
 * route that does not exist (or miss one that does).
 *
 * Relies on three no-op tags added to the middleware factories:
 *   validate()            -> fn.__schemas
 *   auth guards           -> fn.__guard
 *   asyncHandler()        -> fn.__handler
 *   uploadSingleFile      -> fn.__multipart
 */

function layerPath(layer) {
  if (layer.regexp && layer.regexp.fast_slash) return '';

  const match = layer.regexp
    .toString()
    .replace('\\/?', '')
    .replace('(?=\\/|$)', '$')
    .match(/^\/\^((?:\\[.*+?^${}()|[\]\\/]|[^.*+?^${}()|[\]\\/])*)\$\//);

  return match ? match[1].replace(/\\(.)/g, '$1') : '';
}

function appliesTo(usePath, relativePath) {
  return usePath === '' || relativePath === usePath || relativePath.startsWith(`${usePath}/`);
}

function walk(stack, prefix, inherited, out) {
  const uses = [];

  for (const layer of stack) {
    if (layer.route) {
      const relative = layer.route.path === '/' ? '' : layer.route.path;
      const guards = [...inherited];

      for (const use of uses) {
        if (appliesTo(use.path, relative)) guards.push(use.guard);
      }

      let schemas = {};
      let multipart = false;
      let handler = null;

      for (const part of layer.route.stack) {
        const fn = part.handle;

        if (fn.__guard) guards.push(fn.__guard);
        if (fn.__schemas) schemas = { ...schemas, ...fn.__schemas };
        if (fn.__multipart) multipart = true;
        handler = fn.__handler || fn;
      }

      for (const method of Object.keys(layer.route.methods)) {
        out.push({
          method: method.toUpperCase(),
          path: prefix + layer.route.path,
          guards,
          schemas,
          multipart,
          handlerSource: handler ? String(handler) : '',
        });
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      const sub = layerPath(layer);
      const guards = [...inherited];

      for (const use of uses) {
        if (appliesTo(use.path, sub)) guards.push(use.guard);
      }

      walk(layer.handle.stack, prefix + sub, guards, out);
    } else if (layer.handle && layer.handle.__guard) {
      uses.push({ path: layerPath(layer), guard: layer.handle.__guard });
    }
  }
}

function collectRoutes(app) {
  const out = [];

  walk(app._router.stack, '', [], out);

  const seen = new Set();

  return out.filter((route) => {
    const key = `${route.method} ${route.path}`;

    if (seen.has(key)) return false;
    seen.add(key);

    return true;
  });
}

/** Human description of who may call a route, derived from its guards. */
function describeAccess(route) {
  const guards = route.guards;
  const has = (type) => guards.some((guard) => guard.type === type);
  const roles = guards.filter((g) => g.type === 'role').map((g) => g.roles.join('|'));
  const module = guards.find((g) => g.type === 'module');
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(route.method);

  if (roles.includes('admin')) {
    return { kind: 'owner', label: 'Owner (admin) only', login: 'admin' };
  }

  if (module) {
    return {
      kind: 'staff',
      label: `Staff or owner - permission \`${module.module}.${readOnly ? 'read' : 'manage'}\` (owner always passes)`,
      login: 'admin',
    };
  }

  if (has('authenticate')) {
    return { kind: 'user', label: 'Any signed-in, active user (session cookie)', login: 'customer' };
  }

  if (has('optional')) {
    return {
      kind: 'optional',
      label: 'Public. A session is optional (guest checkout allowed; a signed-in user is recognised)',
      login: null,
    };
  }

  return { kind: 'public', label: 'Public (no session needed)', login: null };
}

/** Success status inferred from the controller source. */
function expectedSuccess(route) {
  const source = route.handlerSource;

  if (/\bcreated\s*\(|\.status\(\s*201\s*\)|statusCode:\s*201/.test(source)) return 201;
  if (/\.status\(\s*204\s*\)|sendStatus\(\s*204\s*\)/.test(source)) return 204;
  if (/\.redirect\(/.test(source)) return 303;

  return 200;
}

module.exports = { collectRoutes, describeAccess, expectedSuccess };
