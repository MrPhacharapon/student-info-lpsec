// api/students.js - Vercel Serverless Function with Edge CDN Caching
// Proxies student data from Google Apps Script and caches at Vercel Edge CDN

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq/exec";

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Forward POST requests directly to Google Apps Script without caching
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      const data = await response.json();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json(data);
    }

    // GET Request: Fetch student data from Google Apps Script with Edge Caching
    const action = (req.query && req.query.action) ? req.query.action : 'getStudentDataAndConfig';
    const targetUrl = `${GAS_API_URL}?action=${encodeURIComponent(action)}` + (req.query.url ? `&url=${encodeURIComponent(req.query.url)}` : '');

    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Google Apps Script API responded with HTTP status ${response.status}`);
    }

    const data = await response.json();

    // Vercel Edge CDN Caching Headers:
    // s-maxage=300: Cache in Vercel Edge CDN for 5 minutes (300 seconds)
    // stale-while-revalidate=600: Serve stale cache instantly (< 50ms) while revalidating in background for up to 10 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Internal Server Error while proxying to Google Apps Script'
    });
  }
};
