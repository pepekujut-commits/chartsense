require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3005; // Switching from 3001 to bypass zombie processes and caching

// ─── MIDDLEWARE ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── HEALTH CHECK (DIAGNOSTICS) ───
app.get('/api/health', (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasValidKey = !!apiKey && apiKey !== 'TVUJ_NOVY_KLIC_ZDE' && apiKey.startsWith('AIzaSy');
  
  res.json({ 
    status: 'ok', 
    version: '1.2.5', 
    env: process.env.NODE_ENV || 'development',
    hasApiKey: hasValidKey,
    apiKeyNote: hasValidKey ? 'Present' : 'Missing or Invalid',
    isHealthy: hasValidKey,
    time: new Date().toISOString() 
  });
});

// ─── IN-MEMORY STATE ───
const usageStats = {}; 
const FREE_LIMIT = 3;

// ─── ROUTES (API) ───
app.get(['/api/status', '/status'], (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };
  res.json({
    creditsRemaining: Math.max(0, FREE_LIMIT - usageStats[ip].count),
    isPro: usageStats[ip].isPro
  });
});

app.post(['/api/checkout', '/checkout'], (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  usageStats[ip].isPro = true;
  res.json({ success: true, message: 'Upgraded to PRO' });
});

app.get(['/api/screener', '/screener'], async (req, res) => {
  try {
    // Switching to CryptoCompare as Binance blocks some data-center IPs
    const fsyms = "BTC,ETH,SOL,XRP,ADA,DOGE";
    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${fsyms}&tsyms=USDT`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    // Normalize CryptoCompare data into a simpler flat array for the UI
    const rawData = result.RAW || {};
    const normalized = Object.keys(rawData).map(symbol => {
      const data = rawData[symbol].USDT;
      return {
        symbol: symbol + "USDT",
        lastPrice: data.PRICE,
        priceChangePercent: data.CHANGEPCT24HOUR
      };
    });
    
    res.json(normalized);
  } catch (error) {
    console.error('Screener Proxy Error:', error);
    res.status(500).json({ error: 'Failed to fetch screener data' });
  }
});

app.post(['/api/analyze', '/analyze'], async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) return res.status(500).json({ error: { message: 'Missing API Key' } });
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };

  if (!usageStats[ip].isPro && usageStats[ip].count >= FREE_LIMIT) {
    return res.status(403).json({ error: { message: 'Out of free analyses.' } });
  }

  const { model, contents, generationConfig } = req.body;
  const analysisModel = model === "gemini-2.0-flash" || model === "gemini-1.5-flash" || model === "gemini-3-flash" ? "gemini-3-flash-preview" : (model || "gemini-3-flash-preview");

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${analysisModel}:generateContent?key=${API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig })
    });
    const data = await response.json();
    
    if (response.ok) {
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.log(`[Gemini 3 Flash] SUCCESS:`, data.candidates[0].content.parts[0].text);
      } else {
        console.warn(`[Gemini 3 Flash] EMPTY/ERROR:`, JSON.stringify(data, null, 2));
      }
      if (!usageStats[ip].isPro) usageStats[ip].count++;
      return res.json({ ...data, creditsRemaining: usageStats[ip].isPro ? null : Math.max(0, FREE_LIMIT - usageStats[ip].count) });
    } else {
      console.error('Gemini API Error:', data);
      const isLeaked = data.error?.message?.toLowerCase().includes('leaked') || data.error?.status === 'PERMISSION_DENIED';
      
      return res.status(isLeaked ? 403 : response.status).json({
        error: { 
          message: isLeaked ? 'CRITICAL: The API key is invalid or has been disabled by Google (Leaked Key Report).' : (data.error?.message || 'Gemini API call failed'),
          status: response.status,
          isLeaked: isLeaked,
          details: data.error 
        }
      });
    }
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: { message: 'Internal server proxy error', details: error.message } });
  }
});

// ─── SERVE FRONTEND ───
// On Vercel, static files are handled by the platform.
// For local development, we serve the public folder.
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API Not Found' });
    const localIndex = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(localIndex)) res.sendFile(localIndex);
    else res.status(404).send('Not Found');
  });
}

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`ELITE ELITE ELITE: Local dev server running on http://localhost:${PORT}`));
}
