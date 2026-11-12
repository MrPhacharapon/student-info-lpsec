// config.js
const CONFIG = {
  // Direct Google Apps Script backend URL
  GAS_API_URL: "https://script.google.com/macros/s/AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq/exec",

  // Edge-cached API endpoint on Vercel; fallback to direct GAS on local/file
  get API_URL() {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname || '';
      // If deployed on Vercel, route through high-speed Vercel Edge CDN
      if (hostname.endsWith('.vercel.app') || hostname === 'student-info-lpsec.vercel.app') {
        return '/api/students';
      }
    }
    return this.GAS_API_URL;
  }
};
