require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const admin = require('firebase-admin');

// ─── INITIALIZE SAAS SERVICES ───
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Firebase Admin initialization (Service Account via Env)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (e) {
    console.warn('Firebase Admin init failed. Check FIREBASE_SERVICE_ACCOUNT Env var.');
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT missing. Auth verification disabled.');
}

const db = admin.apps.length ? admin.firestore() : null;

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
app.get(['/api/status', '/status'], async (req, res) => {
  const authHeader = req.headers.authorization;
  let uid = null;

  // Verify Firebase Token if present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decodedToken = await admin.auth().verifyIdToken(authHeader.split('Bearer ')[1]);
      uid = decodedToken.uid;
    } catch (e) {
      console.warn('Invalid token');
    }
  }

  if (uid && db) {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      return res.json({
        creditsRemaining: userData.isPro ? '∞' : (userData.credits !== undefined ? userData.credits : 3),
        isPro: userData.isPro || false
      });
    }
  }

  // Fallback to IP-based for guests
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };
  res.json({
    creditsRemaining: Math.max(0, FREE_LIMIT - usageStats[ip].count),
    isPro: usageStats[ip].isPro
  });
});

app.post('/api/create-checkout-session', async (req, res) => {
  const { priceId, userEmail, userId } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId || 'price_1P...PLACEHOLDER', quantity: 1 }],
      mode: 'subscription',
      customer_email: userEmail,
      client_reference_id: userId,
      success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${req.headers.origin}/?status=cancel`,
    });
    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    
    if (userId && db) {
      await db.collection('users').doc(userId).set({ isPro: true }, { merge: true });
      console.log(`User ${userId} upgraded to ELITE PRO.`);
    }
  }

  res.json({ received: true });
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
