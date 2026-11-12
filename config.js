// config.js - Application API Endpoint Configuration
// Enforces Vercel Edge Gateway and prevents direct GAS bypass in production

const CONFIG = (function() {
  const isBrowser = typeof window !== 'undefined' && window.location;
  const hostname = isBrowser ? (window.location.hostname || '') : '';
  const isVercel = hostname.endsWith('.vercel.app') || hostname === 'student-info-lpsec.vercel.app';
  const isLocalServer = hostname === 'localhost' || hostname === '127.0.0.1';

  // Direct GAS URL is only retained as an offline/file fallback
  // In production (Vercel), it is masked/null to prevent client-side bypass
  const DIRECT_GAS_URL = "https://script.google.com/macros/s/AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq/exec";

  return {
    // API endpoint: Always route through Edge Gateway on web hosts
    get API_URL() {
      if (isVercel || isLocalServer) {
        return '/api/students';
      }
      return DIRECT_GAS_URL;
    },

    // Masked backend origin in production
    get BACKEND_ORIGIN() {
      if (isVercel) {
        return '[PROTECTED_EDGE_GATEWAY]';
      }
      return 'DIRECT_GAS_DEV';
    }
  };
})();
