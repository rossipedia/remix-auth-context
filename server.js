import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

import { createRequestHandler } from '@remix-run/express';
import {
  broadcastDevReady,
  createCookieSessionStorage,
  installGlobals,
} from '@remix-run/node';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';
import { Authenticator } from 'remix-auth';
import { FormStrategy } from 'remix-auth-form';
import sourceMapSupport from 'source-map-support';
import makeDebug from 'debug';

const debug = makeDebug('remix:server');

sourceMapSupport.install({
  retrieveSourceMap: function (source) {
    const match = source.startsWith('file://');
    if (match) {
      const filePath = url.fileURLToPath(source);
      const sourceMapPath = `${filePath}.map`;
      if (fs.existsSync(sourceMapPath)) {
        return {
          url: source,
          map: fs.readFileSync(sourceMapPath, 'utf8'),
        };
      }
    }
    return null;
  },
});
installGlobals();

/** @typedef {import('@remix-run/node').ServerBuild} ServerBuild */

const BUILD_PATH = path.resolve('build/index.js');
const VERSION_PATH = path.resolve('build/version.txt');

const initialBuild = await reimportServer();
const remixHandler =
  process.env.NODE_ENV === 'development'
    ? await createDevRequestHandler(initialBuild)
    : createRequestHandler({ build: initialBuild });

const sessionStorage = createCookieSessionStorage({
  cookie: {
    maxAge: 20 * 60, // 20 minutes
    httpOnly: true,
    secure: true,
    secrets: [], // make sure to set this to something in production
  },
});

/** @type {Authenticator<import('./app/context').SessionUser>} */
const auth = new Authenticator(sessionStorage);
auth.use(
  // TODO: Use whatever auth strategy makes sense
  new FormStrategy(async ({ form }) => {
    const username = form.get('username');
    const password = form.get('password');

    debug(
      `Attempting login for user "${username}" with password "${password}"`
    );

    const r = await fetch('https://dummyjson.com/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'content-type': 'application/json' },
    });

    if (!r.ok) {
      throw new Error('Invalid login');
    }

    const body = await r.json();

    // Get your token however. If using remix-auth-oauth2 or remix-auth-auth0,
    // then it'll be provided to your Strategy's `verify` callback.
    // See remix-auth-oauth2 docs for details
    return {
      userId: body.id,
      username,
      token: body.token,
    };
  }),
  'form'
);

const app = express();

app.use(compression());

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable('x-powered-by');

// Remix fingerprints its assets so we can cache forever.
app.use(
  '/build',
  express.static('public/build', { immutable: true, maxAge: '1y' })
);

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static('public', { maxAge: '1h' }));

app.use(morgan('tiny'));

app.all('*', remixHandler);

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Express server listening at http://localhost:${port}`);

  if (process.env.NODE_ENV === 'development') {
    broadcastDevReady(initialBuild);
  }
});

/**
 * @returns {Promise<ServerBuild>}
 */
async function reimportServer() {
  const stat = fs.statSync(BUILD_PATH);

  // convert build path to URL for Windows compatibility with dynamic `import`
  const BUILD_URL = url.pathToFileURL(BUILD_PATH).href;

  // use a timestamp query parameter to bust the import cache
  return import(BUILD_URL + '?t=' + stat.mtimeMs);
}

/**
 * @param {ServerBuild} initialBuild
 * @returns {Promise<import('@remix-run/express').RequestHandler>}
 */
async function createDevRequestHandler(initialBuild) {
  let build = initialBuild;
  async function handleServerUpdate() {
    // 1. re-import the server build
    build = await reimportServer();
    // 2. tell Remix that this app server is now up-to-date and ready
    broadcastDevReady(build);
  }
  const chokidar = await import('chokidar');
  chokidar
    .watch(VERSION_PATH, { ignoreInitial: true })
    .on('add', handleServerUpdate)
    .on('change', handleServerUpdate);

  // wrap request handler to make sure its recreated with the latest build for every request
  return async (req, res, next) => {
    try {
      return createRequestHandler({
        build,
        mode: 'development',
        getLoadContext: getAppLoadContext,
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * @type {import('@remix-run/express').GetLoadContextFunction}
 */
async function getAppLoadContext(req) {
  return {
    auth,
    sessionStorage,
    fetch: createFetchWithToken(req),
  };
}

/**
 *
 * @param {import('express').Request} req
 * @returns {typeof fetch}
 */
function createFetchWithToken(req) {
  return async function fetchWithToken(input, init) {
    // If there's already an Authorization header, skip
    if (req.headers.authorization) {
      debug('Existing authorization header, skipping...');
      return fetch.call(null, input, init);
    }

    // If we don't have a session attached to the request, then there's nothing
    // to do here
    const session = await sessionStorage.getSession(req.headers.cookie);
    if (!session) {
      debug('No session present on request, skipping...');
      return fetch.call(null, input, init);
    }

    // If we have a session, then we can attach the token to the request

    // What exactly this looks like depends on your setup and what kind of
    // session storage you're using.

    /** @type {import('./app/context').SessionUser} */
    const user = session.get(auth.sessionKey);

    const token = user?.token;

    // No token on session, then skip
    if (!token) {
      debug('No token found on session, skipping...');
      return fetch.call(null, input, init);
    }

    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);

    debug('Attaching token to request: ' + token);

    // set any other standard headers for your upstream API here, such as
    // 'accept', 'content-type', `user-agent`, etc.

    return fetch(input, {
      ...init,
      headers,
    });
  };
}
