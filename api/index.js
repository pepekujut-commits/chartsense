require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3005; // Switching from 3001 to bypass zombie processes and caching

// ─── INITIALIZE SAAS SERVICES ───
let stripe;
try {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_...') {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  } else {
    console.warn('STRIPE_SECRET_KEY missing or placeholder. Payments will run in DEMO MOCK mode.');
  }
} catch (e) {
  console.warn('Stripe init failed:', e.message);
}

// Firebase Admin initialization (Service Account via Env)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    // PEM private keys must have real newlines
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (e) {
    console.warn('Firebase Admin init failed. Check FIREBASE_SERVICE_ACCOUNT format.');
    console.warn('Detailed Error:', e.message);
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT missing. Auth verification and DB features will be limited.');
}

const db = admin.apps.length ? admin.firestore() : null;

// PORT and app already initialized at the top

app.get('/api/debug-sync', async (req, res) => {
  res.json({
    stripeInitialized: !!stripe,
    firebaseInitialized: !!db,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasFirebaseKey: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    adminApps: admin.apps.length,
    timestamp: new Date().toISOString()
  });
});

// ─── MIDDLEWARE ───
app.use(cors());

// Webhook route must come before express.json() for raw body access
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body);

    if (stripe && webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      console.warn('STRIPE_WEBHOOK_SECRET missing. Using fallback parsing (UNSAFE).');
      event = JSON.parse(rawBody.toString());
    }
  } catch (err) {
    console.error(`Webhook Verification Failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    let userId = session.client_reference_id;
    const customerEmail = session.customer_details?.email;
    
    console.log(`[STRIPE] Processing Success for: ${customerEmail} (ID: ${userId})`);

    if (db) {
      try {
        // Fallback: If userId missing, find by email (Case-Insensitive check)
        if (!userId && customerEmail) {
          console.log(`Searching for user by email: ${customerEmail}`);
          const emailLower = customerEmail.toLowerCase();
          
          // Try exact match first, then lowercase
          let userQuery = await db.collection('users').where('email', '==', customerEmail).limit(1).get();
          if (userQuery.empty) {
            userQuery = await db.collection('users').where('email', '==', emailLower).limit(1).get();
          }

          if (!userQuery.empty) {
            userId = userQuery.docs[0].id;
          } else {
            // CRITICAL: If still not found, create a placeholder Pro record by email
            // This ensures they get access as soon as they log in with this email later
            console.warn(`User document not found for ${customerEmail}. Creating pre-fulfillment record.`);
            await db.collection('pro_backlog').doc(emailLower).set({
              email: emailLower,
              isPro: true,
              timestamp: new Date().toISOString()
            });
          }
        }

        if (userId) {
          await db.collection('users').doc(userId).set({ 
            isPro: true,
            stripeCustomer: session.customer,
            subscriptionId: session.subscription,
            planType: 'pro',
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`[STRIPE] SUCCESS: User ${userId} upgraded to ELITE PRO.`);
        } else {
          console.warn('[STRIPE] FAILURE: Could not identify user for fulfillment.');
        }
      } catch (e) {
        console.error('Webhook DB Update Failed:', e.message);
      }
    }
  }

  res.json({received: true});
});

app.use(express.json({ limit: '10mb' }));

// ─── HEALTH CHECK (DIAGNOSTICS) ───
app.get(['/api/health', '/health'], (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const hasValidKey = !!apiKey && apiKey !== 'TVUJ_NOVY_KLIC_ZDE' && apiKey.startsWith('AIzaSy');
  
  res.json({ 
    status: 'ok', 
    version: '1.2.5', 
    env: process.env.NODE_ENV || 'development',
    hasApiKey: hasValidKey,
    apiKeyNote: hasValidKey ? 'Present' : 'Missing or Invalid',
    isHealthy: hasValidKey,
    time: new Date().toISOString(),
    services: {
      stripe: !!stripe,
      firebase: !!db
    }
  });
});

// ─── UTILS ───
const FREE_LIMIT = 3;

async function getUsage(req) {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const authHeader = req.headers.authorization;
  let uid = null;

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
      const data = userDoc.data();
      return {
        isPro: data.isPro || false,
        creditsRemaining: data.isPro ? '∞' : (data.creditsRemaining !== undefined ? data.creditsRemaining : FREE_LIMIT),
        uid
      };
    }
    return { isPro: false, creditsRemaining: FREE_LIMIT, uid };
  }

  // Guest usage (IP-based Firestore)
  if (db) {
    const guestDoc = await db.collection('guests').doc(ip.replace(/\./g, '_')).get();
    if (guestDoc.exists) {
      const data = guestDoc.data();
      return {
        isPro: false,
        creditsRemaining: Math.max(0, FREE_LIMIT - (data.count || 0)),
        ip
      };
    }
  }

  return { isPro: false, creditsRemaining: FREE_LIMIT, ip };
}

async function incrementUsage(usage) {
  if (usage.isPro || !db) return;

  if (usage.uid) {
    const userRef = db.collection('users').doc(usage.uid);
    const doc = await userRef.get();
    const currentCredits = doc.exists && doc.data().creditsRemaining !== undefined ? doc.data().creditsRemaining : FREE_LIMIT;
    await userRef.set({ creditsRemaining: Math.max(0, currentCredits - 1) }, { merge: true });
  } else if (usage.ip) {
    const guestRef = db.collection('guests').doc(usage.ip.replace(/\./g, '_'));
    const doc = await guestRef.get();
    const currentCount = doc.exists ? (doc.data().count || 0) : 0;
    await guestRef.set({ count: currentCount + 1, lastUsed: new Date().toISOString() }, { merge: true });
  }
}

// ─── ROUTES (API) ───
app.get(['/api/status', '/status'], async (req, res) => {
  const usage = await getUsage(req);
  res.json({
    creditsRemaining: usage.creditsRemaining,
    isPro: usage.isPro
  });
});

app.post('/api/create-checkout-session', async (req, res) => {
  const { planType, userEmail, userId } = req.body;
  
  const monthlyPriceId = process.env.STRIPE_PRICE_ID_MONTHLY || 'price_1TMSI6V05gkWPOqDDhDusUlG';
  const yearlyPriceId = process.env.STRIPE_PRICE_ID_YEARLY || 'price_1Q5...YOUR_YEARLY_ID_HERE';
  
  const realPriceId = planType === 'yearly' ? yearlyPriceId : monthlyPriceId;
  
  // If Stripe is not configured, simulate a successful checkout for development
  if (!stripe) {
    console.log(`[MOCK CHECKOUT] User ${userEmail} initiated update. Redirecting to success...`);
    // In mock mode, we immediately upgrade the user if DB is available, or just return a dummy URL
    if (userId && db) {
      setTimeout(async () => {
        try {
          await db.collection('users').doc(userId).set({ 
            isPro: true,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`[MOCK] User ${userId} upgraded to ELITE PRO (Mock DB Write).`);
        } catch (e) { console.error('Mock DB Write failed:', e); }
      }, 1000);
    }
    return res.json({ url: `${req.headers.origin}/?status=success&mock=true` });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: realPriceId, quantity: 1 }],
      mode: 'subscription',
      customer_email: userEmail,
      client_reference_id: userId,
      metadata: { userId: userId },
      success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${req.headers.origin}/?status=cancel`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fulfill-checkout-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const sessionId = req.query.session_id;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id' });
  }
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe is not initialized' });
  }
  if (!db) {
    return res.status(500).json({ error: 'Database not initialized' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const refUserId = session.client_reference_id || session.metadata?.userId;

    if (refUserId && refUserId !== uid) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    if (session.mode !== 'subscription' || session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Checkout not completed/paid' });
    }

    await db.collection('users').doc(uid).set({
      isPro: true,
      stripeCustomer: session.customer,
      subscriptionId: session.subscription,
      planType: 'pro',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return res.json({ ok: true, isPro: true });
  } catch (error) {
    console.error('Fulfillment Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-portal-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!db) return res.status(500).json({ error: 'Database not initialized' });

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !userDoc.data().stripeCustomer) {
      return res.status(400).json({ error: 'No active subscription found. Upgrade first.' });
    }

    const customerId = userDoc.data().stripeCustomer;

    if (!stripe) {
      // Mock portal for dev
      return res.json({ url: 'https://billing.stripe.com/p/session/test_mock_portal' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.origin}/`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal Session Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!db) return res.status(500).json({ error: 'Database not initialized' });

    const snapshots = await db.collection('users').doc(uid).collection('analyses')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const history = [];
    snapshots.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook is handled above to ensure raw body access

app.get(['/api/screener', '/screener'], async (req, res) => {
  try {
    // Switching to CryptoCompare as Binance blocks some data-center IPs
    const fsyms = "BTC,ETH,SOL,XRP,ADA,DOGE";
    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${fsyms}&tsyms=USDT`;
    
    const response = await fetch(url);
    const result = await response.json();
    
    // Normalize CryptoCompare data into a simpler flat array for the UI
    const rawData = result.RAW || {};
    const normalized = Object.keys(rawData)
      .filter(symbol => rawData[symbol] && rawData[symbol].USDT)
      .map(symbol => {
        const data = rawData[symbol].USDT;
        return {
          symbol: symbol + "USDT",
          lastPrice: data.PRICE || 0,
          priceChangePercent: data.CHANGEPCT24HOUR || 0
        };
      });
    
    res.json(normalized);
  } catch (error) {
    console.error('Screener Proxy Error:', error);
    res.status(500).json({ error: 'Failed to fetch screener data' });
  }
});

app.post(['/api/analyze', '/analyze'], async (req, res) => {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: { message: 'Missing API Key' } });

  const usage = await getUsage(req);

  if (!usage.isPro && usage.creditsRemaining <= 0) {
    return res.status(403).json({ error: { message: 'Out of free analyses.' } });
  }

  const { model, contents, generationConfig } = req.body;
  // Use gemini-3-flash-preview as the default V5 elite model
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
        
        // Save to History (V5 Elite)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ') && db) {
          try {
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            const uid = decodedToken.uid;
            
            // Extract the result if JSON
            const rawText = data.candidates[0].content.parts[0].text;
            // Simple extraction (regex) for safety
            const jsonPart = rawText.match(/\{[\s\S]*\}/)?.[0] || rawText;
            
            await db.collection('users').doc(uid).collection('analyses').add({
              timestamp: new Date().toISOString(),
              result: jsonPart,
              model: analysisModel
            });
            console.log(`[DB] Analysis saved for user ${uid}`);
          } catch (e) {
            console.warn('Analysis save failed (deferred):', e.message);
          }
        }
      }
      
      await incrementUsage(usage);
      const updatedUsage = await getUsage(req);
      
      return res.json({ ...data, creditsRemaining: updatedUsage.isPro ? null : updatedUsage.creditsRemaining });
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
