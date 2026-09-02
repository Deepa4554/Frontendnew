const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

const config = {
  mode: 'development',
  // Non-eval source maps: webpack's default dev devtool ('eval') wraps every
  // module in eval(...), which the CSP's script-src 'self' (no 'unsafe-eval')
  // blocks outright, leaving the page blank.
  devtool: 'cheap-module-source-map',
  entry: {
    app: path.resolve(__dirname, 'index.web.js'),
    // Compiled to a SEPARATE, un-hashed bundle — browsers register/fetch a service worker by
    // its exact literal URL (see pushNotifications.web.ts's navigator.serviceWorker.register
    // call), so this can't ride along with the content-hashed app bundle below. Its own update
    // detection is the browser's normal SW byte-diff check on every page load, not a filename
    // change. See web/firebase-messaging-sw.ts for what it actually does.
    'firebase-messaging-sw': path.resolve(__dirname, 'web/firebase-messaging-sw.ts'),
  },
  output: {
    path: path.resolve(__dirname, 'dist-web'),
    // Content-hashed so every deploy that actually changes the bundle gets a
    // new filename — index.html (see HtmlWebpackPlugin below) always
    // references the current hash, so a browser holding a long-cached copy
    // of an OLD bundle.<hash>.js simply never requests that URL again; it
    // fetches the new one under its own new URL instead of needing a manual
    // cache-clear.
    filename: (pathData) => (pathData.chunk.name === 'firebase-messaging-sw' ? '[name].js' : 'bundle.[contenthash].js'),
    publicPath: '/',
    // Without this, every previous build's differently-hashed bundle.<hash>.js
    // just accumulates in dist-web forever instead of being replaced.
    clean: true,
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js'],
    // Prefer CJS "main" builds over the "module" (ESM) builds — several RN
    // ecosystem packages ship hybrid ESM/CJS "module" bundles meant for Metro,
    // which break under webpack's harmony module handling ("exports is not defined").
    mainFields: ['browser', 'main'],
    alias: {
      'react-native$': 'react-native-web',
      'react-native-mmkv': path.resolve(__dirname, 'web/mocks/react-native-mmkv.js'),
      'react-native-fs': path.resolve(__dirname, 'web/mocks/react-native-fs.js'),
      'react-native-share': path.resolve(__dirname, 'web/mocks/react-native-share.js'),
      'react-native-html-to-pdf': path.resolve(__dirname, 'web/mocks/react-native-html-to-pdf.js'),
      'lottie-react-native': path.resolve(__dirname, 'web/mocks/lottie-react-native.js'),
      'react-native-linear-gradient': path.resolve(__dirname, 'web/mocks/react-native-linear-gradient.js'),
      // Optional peer deps only touched by unused code paths — silence instead of stubbing.
      'expo-linear-gradient': false,
      '@react-native-vector-icons/material-design-icons': false,
      '@expo/vector-icons/MaterialCommunityIcons': false,
      // Native-only (FCM push) — every call site checks Platform.OS === 'web' before ever
      // invoking messaging(), so an empty module is enough. Web push uses a completely
      // separate implementation (the 'firebase' npm package directly, no RN wrapper) — see
      // pushNotifications.web.ts and web/firebase-messaging-sw.ts.
      '@react-native-firebase/messaging': false,
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        // Only transform our own source — prebuilt libraries in node_modules are
        // already shipped as plain, browser-consumable JS (ESM or CJS as authored).
        // Running them back through the Metro-oriented babel preset corrupts their
        // module output (e.g. "exports is not defined" on @react-navigation's ESM builds).
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['module:@react-native/babel-preset'],
            plugins: ['@babel/plugin-transform-export-namespace-from'],
          },
        },
      },
      {
        // react-native-vector-icons and react-native-qrcode-svg both ship
        // un-transpiled JSX in their raw .js files.
        test: /\.jsx?$/,
        include: /node_modules[\\/](react-native-vector-icons|react-native-qrcode-svg)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
          },
        },
      },
      {
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.(png|jpe?g|gif|svg)$/,
        type: 'asset/resource',
      },
      {
        test: /\.(ttf|otf|woff|woff2)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'public/index.html'),
      favicon: path.resolve(__dirname, 'public/assets/brand/prabandhos_icon.svg'),
      // Otherwise HtmlWebpackPlugin injects a <script> tag for EVERY entry above, including
      // the service-worker bundle — which must only ever load inside its own SW execution
      // context (via register()), never as a normal <script> in the page itself.
      chunks: ['app'],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/react-native-vector-icons/Fonts'),
          to: path.resolve(__dirname, 'dist-web/fonts'),
        },
        {
          from: path.resolve(__dirname, 'public/errorLogger.js'),
          to: path.resolve(__dirname, 'dist-web/errorLogger.js'),
        },
        {
          // Cloudflare Pages SPA fallback: without this, any direct hit on a
          // client-side route (e.g. /dashboard) 404s at the edge before
          // React Navigation ever loads (vercel.json's rewrite has no effect
          // here — Cloudflare Pages only honors _redirects).
          from: path.resolve(__dirname, 'public/_redirects'),
          to: path.resolve(__dirname, 'dist-web/_redirects'),
        },
        {
          // Self-hosted Tesseract.js OCR engine + language data (see
          // menuPhotoOcrFallback.ts) — served same-origin so "Import from
          // Photo" works under the CSP (no CDN in script-src/connect-src)
          // and offline, instead of the library's jsdelivr CDN default.
          from: path.resolve(__dirname, 'public/tesseract'),
          to: path.resolve(__dirname, 'dist-web/tesseract'),
        },
      ],
    }),
    // DefinePlugin's __DEV__/NODE_ENV values are injected from the exported
    // function below so they track the actual build mode (dev serve vs
    // `webpack --mode production` for deploys) instead of being pinned to dev.
  ],
  devServer: {
    static: path.resolve(__dirname, 'dist-web'),
    port: 3000,
    host: '0.0.0.0',
    historyApiFallback: true,
    hot: true,
    // Local mirror of vercel.json's /api and /hubs rewrites. The web build addresses the
    // backend same-origin (env.ts's WEB_PROXIED_ORIGIN is ''), because a cross-site
    // SameSite=None cookie is blocked outright on the deployed frontend — but that only
    // works if something on this origin actually forwards those paths. Without this proxy
    // the dev server answers /api/auth/login itself, and historyApiFallback above hands
    // back index.html, so every API call resolves to HTML and login fails with a parse
    // error rather than anything that names the real problem.
    //
    // ws: true covers the SignalR hub (/hubs/orders). Unlike Vercel's rewrite, which can't
    // carry a WebSocket upgrade at all, this proxy can — so realtime runs over real
    // WebSockets locally and falls back to SSE/long-polling only on the deployed site (see
    // ordersRealtime.ts's per-platform transport choice).
    proxy: [
      {
        context: ['/api', '/hubs'],
        target: 'http://localhost:5080', // CafePosApi's http profile — see its launchSettings.json
        ws: true,
      },
    ],
    // A phone's Wi-Fi connection drops the dev-server WebSocket far more often
    // than a wired desktop one (screen-off power saving, roaming between APs).
    // liveReload's fallback is to force a full window.location.reload() on
    // any such disconnect/reconnect — on a phone that lands mid-typing, wiping
    // whatever was in the currently-focused input and closing the on-screen
    // keyboard as the page navigates. Disabling it leaves plain HMR (which
    // degrades gracefully — no update applied — instead of reloading) and lets
    // the client keep retrying the socket indefinitely rather than giving up.
    liveReload: false,
    client: {
      reconnect: true,
      overlay: {
        errors: true,
        warnings: false,
        runtimeErrors: true,
      },
    },
  },
};

/**
 * `webpack serve --env https` serves over TLS instead of plain HTTP.
 *
 * Browsers expose "powerful" APIs — geolocation above all — only in a secure
 * context: https, localhost, or 127.0.0.1. Opening the dev server from a phone
 * as http://<lan-ip>:3000 therefore breaks Cafe Profile's "Use Current Location"
 * and attendance punch in/out, with no permission prompt ever shown (see
 * src/core/utils/geolocation.ts's isSecureContext check).
 *
 * webpack-dev-server's built-in self-signed certificate only names localhost and
 * 127.0.0.1, so a phone hitting the LAN IP still gets an interstitial to click
 * through every load. Point SSL_CRT_FILE/SSL_KEY_FILE at a certificate that names
 * this machine's LAN IP for a clean load:
 *
 *   mkcert 192.168.1.5
 *   $env:SSL_CRT_FILE="./192.168.1.5.pem"; $env:SSL_KEY_FILE="./192.168.1.5-key.pem"
 *   npm run web:https
 */
module.exports = (env = {}, argv = {}) => {
  // `webpack --mode production` (see the build:web script / vercel.json) flips
  // the whole build to production: minification, __DEV__ off, and a
  // NODE_ENV that the RN-Web ecosystem reads to drop dev-only warnings.
  const isProd = argv.mode === 'production' || env.production === true;
  if (isProd) {
    config.mode = 'production';
    // Full (non-eval) source maps in prod — still CSP-safe, unlike webpack's
    // eval-based default; ship them as separate .map files, not inline.
    config.devtool = 'source-map';
  }
  config.plugins.push(
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(!isProd),
      'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
    }),
  );

  if (!env.https) return config;

  const { SSL_CRT_FILE, SSL_KEY_FILE } = process.env;
  config.devServer.server =
    SSL_CRT_FILE && SSL_KEY_FILE
      ? { type: 'https', options: { cert: SSL_CRT_FILE, key: SSL_KEY_FILE } }
      : 'https';

  return config;
};
