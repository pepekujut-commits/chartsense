const CONFIG = {
  DEFAULT_MODEL: 'gemini-3-flash-preview', // Correct April 2026 flagship identifier
  BACKEND_URL: '/api/analyze',
  STATUS_URL: '/api/status',
  CHECKOUT_URL: '/api/checkout',
  HEALTH_URL: '/api/health',
  SCREENER_URL: '/api/screener'
};

// ─── STATE ───
let state = {
  model: CONFIG.DEFAULT_MODEL,
  creditsRemaining: 3,
  isPro: false,
  user: null, // User object for Auth
  selectedFile: null,
  isAnalyzing: false,
  healthChecked: false,
  pendingAction: null // V5: Track intent across Auth flows
};

// ─── HEALTH CHECK (DIAGNOSTICS) ───
async function checkHealth() {
  const dot = document.getElementById('healthDot');
  if (!dot) return;
  try {
    const res = await fetch(CONFIG.HEALTH_URL);
    if (res.ok) {
      const data = await res.json();
      dot.classList.remove('err');
      dot.classList.add('ok');
      
      let tooltip = `API Connected (v${data.version})`;
      if (!data.hasApiKey || data.apiKeyNote === 'Missing') {
        tooltip += ' - ACTION REQUIRED: Paste your NEW Gemini API Key into .env';
        dot.style.background = 'var(--yellow)';
      } else {
        tooltip += ' - API Key Ready';
        dot.style.background = 'var(--green)';
      }
      dot.title = tooltip;
      state.healthChecked = true;
    } else {
      throw new Error();
    }
  } catch (err) {
    dot.classList.remove('ok');
    dot.classList.add('err');
    dot.title = 'API Connection Failed. Server may be starting or offline.';
    console.error('API Connection Failed. Please check Vercel logs.');
  }
}

// ─── DOM ELEMENTS ───
const el = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  previewImg: document.getElementById('previewImg'),
  dropzoneInner: document.getElementById('dropzoneInner'),
  tickerInput: document.getElementById('tickerInput'),
  timeframeSelect: document.getElementById('timeframeSelect'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  analyzeBtnText: document.getElementById('analyzeBtnText'),
  spinner: document.getElementById('spinner'),
  creditsCount: document.getElementById('creditsCount'),
  paywallNote: document.getElementById('paywallNote'),
  upgradeBtn: document.getElementById('upgradeBtn'),
  paywallOverlay: document.getElementById('paywallOverlay'),
  
  resultsPlaceholder: document.getElementById('resultsPlaceholder'),
  resultsPanel: document.getElementById('resultsPanel'),
  resultsContent: document.getElementById('resultsContent'),
  verdictBadge: document.getElementById('verdictBadge'),
  verdictTicker: document.getElementById('verdictTicker'),
  verdictTf: document.getElementById('verdictTf'),
  confidencePct: document.getElementById('confidencePct'),
  ringFill: document.getElementById('ringFill'),
  pillsRow: document.getElementById('pillsRow'),
  levelsGrid: document.getElementById('levelsGrid'),
  reasoningBox: document.getElementById('reasoningBox'),
  riskRow: document.getElementById('riskRow'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  
  // V3 Elite Elements
  terminalOverlay: document.getElementById('terminalOverlay'),
  terminalBody: document.getElementById('terminalBody'),
  metricTrend: document.getElementById('metricTrend'),
  metricRsi: document.getElementById('metricRsi'),
  metricVol: document.getElementById('metricVol'),
  metricSmc: document.getElementById('metricSmc'),
  
  // V4 Setup Elements
  setupEntry: document.getElementById('setupEntry'),
  setupSl: document.getElementById('setupSl'),
  tp1: document.getElementById('tp1'),
  tp2: document.getElementById('tp2'),
  tp3: document.getElementById('tp3'),

  // ─── HEALTH CHECK (DIAGNOSTICS) ───
  openAuth: document.getElementById('openAuth'),
  authModal: document.getElementById('authModal'),
  closeAuth: document.getElementById('closeAuth'),
  authForm: document.getElementById('authForm'),
  userProfile: document.getElementById('userProfile'),
  userAvatar: document.getElementById('userAvatar'),
  userMenu: document.getElementById('userMenu'),
  userEmailAddress: document.getElementById('userEmailAddress'),
  logoutBtn: document.getElementById('logoutBtn'),
  
  checkoutModal: document.getElementById('checkoutModal'),
  closeCheckout: document.getElementById('closeCheckout'),
  completeCheckout: document.getElementById('completeCheckout'),
  
  // V5 Elite Elements
  screenerBody: document.getElementById('screenerBody'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  chatSendBtn: document.getElementById('chatSendBtn'),
  rrRatio: document.getElementById('rrRatio')
};

// ─── INIT ───
async function init() {
  await checkHealth();
  await syncStatus();
  setupEventListeners();
  checkAuth();
  startLiveStats(); 
  initScreener(); // V5: Start the real-time Binance feed
}

/**
 * Simulates real-time institutional activity by jittering the sidebar numbers.
 */
function startLiveStats() {
  const stats = {
    accuracy: { el: document.getElementById('statAccuracy'), val: 89.4, suffix: '%' },
    analysts: { el: document.getElementById('statAnalysts'), val: 4281, suffix: '' },
    volume: { el: document.getElementById('statVolume'), val: 18102, suffix: '' }
  };

  setInterval(() => {
    //AI Accuracy Jitter (-0.2 to +0.2)
    if (stats.accuracy.el) {
      const delta = (Math.random() * 0.4 - 0.2).toFixed(1);
      stats.accuracy.val = Math.max(88, Math.min(94, parseFloat((stats.accuracy.val + parseFloat(delta)).toFixed(1))));
      stats.accuracy.el.textContent = `${stats.accuracy.val}%`;
    }

    // Active Analysts (+/- 3)
    if (stats.analysts.el) {
      const delta = Math.floor(Math.random() * 7 - 3);
      stats.analysts.val = Math.max(4000, stats.analysts.val + delta);
      stats.analysts.el.textContent = stats.analysts.val.toLocaleString();
    }

    // Signal Vol (+/- 12)
    if (stats.volume.el) {
      const delta = Math.floor(Math.random() * 25 - 12);
      stats.volume.val = Math.max(15000, stats.volume.val + delta);
      stats.volume.el.textContent = stats.volume.val.toLocaleString();
    }
  }, 4000); // Pulse every 4 seconds for a professional look
}

async function syncStatus() {
  try {
    const response = await fetch(CONFIG.STATUS_URL);
    if (!response.ok) throw new Error('Network error');
    
    const data = await response.json();
    state.creditsRemaining = data.creditsRemaining;
    state.isPro = data.isPro;
    updateCreditsUI();
    checkAnalyzeStatus();
  } catch (e) {
    console.warn('Backend sync deferred: using local state (Pro Trial Mode)');
    // Fallback UI if backend is deploying
    updateCreditsUI();
  }
}

function setupEventListeners() {
  // Upload handlers
  el.dropzone.onclick = () => el.fileInput.click();
  el.fileInput.onchange = (e) => handleFile(e.target.files[0]);
  
  el.dropzone.ondragover = (e) => { e.preventDefault(); el.dropzone.classList.add('drag-over'); };
  el.dropzone.ondragleave = () => el.dropzone.classList.remove('drag-over');
  el.dropzone.ondrop = (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  };

  // Analysis
  el.analyzeBtn.onclick = startAnalysis;

  // Auth Handlers
  el.openAuth.onclick = () => el.authModal.classList.remove('hidden');
  el.closeAuth.onclick = () => el.authModal.classList.add('hidden');
  el.authForm.onsubmit = handleAuthSubmit;
  el.userAvatar.onclick = () => el.userMenu.classList.toggle('hidden');
  el.logoutBtn.onclick = logout;

  // Checkout Handlers
  el.upgradeBtn.onclick = () => {
    if (!state.user) {
      state.pendingAction = 'checkout';
      el.authModal.classList.remove('hidden');
    } else {
      el.checkoutModal.classList.remove('hidden');
    }
  };
  el.closeCheckout.onclick = () => el.checkoutModal.classList.add('hidden');
  el.completeCheckout.onclick = handlePayment;
  el.exportPdfBtn.onclick = exportToPdf;

  // Chat Handlers
  el.chatSendBtn.onclick = sendChat;
  el.chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendChat(); };

  // Generic close for modals and menus
  window.onclick = (event) => {
    if (event.target === el.authModal) el.authModal.classList.add('hidden');
    if (event.target === el.checkoutModal) el.checkoutModal.classList.add('hidden');
    if (event.target === document.getElementById('comingSoonModal')) document.getElementById('comingSoonModal').classList.add('hidden');
    if (!event.target.closest('#userProfile') && el.userMenu) el.userMenu.classList.add('hidden');
  };
}

// ─── AUTH LOGIC ───
function checkAuth() {
  const savedUser = localStorage.getItem('chartsense_user');
  if (savedUser) {
    state.user = JSON.parse(savedUser);
    updateAuthUI();
  }
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  
  // Simulation: Accept any login
  state.user = { email, id: 'user_' + Math.random().toString(36).substr(2, 9) };
  localStorage.setItem('chartsense_user', JSON.stringify(state.user));
  
  el.authModal.classList.add('hidden');
  updateAuthUI();

  if (state.pendingAction === 'checkout') {
    state.pendingAction = null;
    el.checkoutModal.classList.remove('hidden');
  }
}

// V5: Unified Upgrade Logic for all CTA buttons
function handleUpgradeBtn() {
  if (!state.user) {
    state.pendingAction = 'checkout';
    el.authModal.classList.remove('hidden');
  } else if (state.isPro) {
    alert('✨ You are already on the Elite plan.');
  } else {
    el.checkoutModal.classList.remove('hidden');
  }
}

// V5: Google Auth Simulation
function handleGoogleLogin() {
  // Simulate institutional Google OAuth flow
  const mockEmail = `institutional.user.${Math.floor(Math.random() * 899) + 100}@gmail.com`;
  
  state.user = { 
    email: mockEmail, 
    id: 'google_' + Math.random().toString(36).substr(2, 9),
    provider: 'google'
  };
  localStorage.setItem('chartsense_user', JSON.stringify(state.user));
  
  el.authModal.classList.add('hidden');
  updateAuthUI();

  if (state.pendingAction === 'checkout') {
    state.pendingAction = null;
    // Small delay for 'Professional Feel'
    setTimeout(() => el.checkoutModal.classList.remove('hidden'), 400);
  }
}

function updateAuthUI() {
  if (state.user) {
    el.openAuth.classList.add('hidden');
    el.userProfile.classList.remove('hidden');
    el.userEmailAddress.textContent = state.user.email;
    el.userAvatar.textContent = state.user.email.charAt(0).toUpperCase();
  } else {
    el.openAuth.classList.remove('hidden');
    el.userProfile.classList.add('hidden');
  }
}

function logout() {
  state.user = null;
  localStorage.removeItem('chartsense_user');
  updateAuthUI();
  location.reload();
}

// ─── FILE HANDLING ───
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  
  state.selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    el.previewImg.src = e.target.result;
    el.previewImg.classList.remove('hidden');
    el.dropzoneInner.classList.add('hidden');
    el.dropzone.classList.add('has-image');
    checkAnalyzeStatus();
  };
  reader.readAsDataURL(file);
}

// ─── CREDITS & STATUS ───
function updateCreditsUI() {
  if (state.isPro) {
    el.creditsCount.textContent = '∞';
    el.creditsCount.classList.remove('out');
    el.creditsCount.style.color = 'var(--purple)';
    el.upgradeBtn.innerHTML = '✨ Pro Active';
    el.upgradeBtn.style.color = 'var(--purple)';
    el.upgradeBtn.disabled = true;
    el.paywallOverlay.classList.add('hidden');
    return;
  }

  el.creditsCount.textContent = state.creditsRemaining;
  
  if (state.creditsRemaining <= 0) {
    el.creditsCount.classList.add('out');
    el.paywallOverlay.classList.remove('hidden');
  } else {
    el.creditsCount.classList.remove('out');
    el.paywallOverlay.classList.add('hidden');
  }
}

function checkAnalyzeStatus() {
  const hasImage = !!state.selectedFile;
  const hasCredits = state.creditsRemaining > 0 || state.isPro;
  el.analyzeBtn.disabled = !hasImage || !hasCredits || state.isAnalyzing;
}

// ─── MONETIZATION LOGIC ───
async function handlePayment() {
  const btn = el.completeCheckout;
  const originalText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> <span>Processing...</span>`;
  
  try {
    await new Promise(r => setTimeout(r, 2000));
    
    // Call server to upgrade (Uses IP-based persistence on backend)
    const response = await fetch(CONFIG.CHECKOUT_URL, { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      state.isPro = true;
      el.checkoutModal.classList.add('hidden');
      updateCreditsUI();
      checkAnalyzeStatus();
      alert('🚀 Welcome to Pro! You now have unlimited analyses.');
    }
  } catch (e) {
    console.error('Payment simulation failed:', e);
    // Silent fail for demo purposes: just upgrade locally
    state.isPro = true;
    el.checkoutModal.classList.add('hidden');
    updateCreditsUI();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function exportToPdf() {
  if (!state.isPro) {
    el.checkoutModal.classList.add('hidden');
    return;
  }
  window.print();
}

// ─── ANALYSIS LOGIC ───
async function startAnalysis() {
  if (state.isAnalyzing) return;

  // GATING: 3 Free Credits otherwise Premium
  if (!state.isPro && state.creditsRemaining <= 0) {
    if (!state.user) {
      el.authModal.classList.remove('hidden');
    } else {
      el.checkoutModal.classList.remove('hidden');
    }
    return;
  }
  
  const ticker = el.tickerInput.value.trim() || 'Unspecified Asset';
  const tf = el.timeframeSelect.value || 'Unspecified Timeframe';
  
  setLoading(true);
  
  try {
    const base64Image = await fileToBase64(state.selectedFile);
    const result = await callGemini(base64Image, ticker, tf);
    
    // Play AI Terminal Animation
    await playTerminalSequence();
    
    renderResults(result, ticker, tf);
    el.resultsContent.scrollIntoView({ behavior: 'smooth' });
    
    if (result.creditsRemaining !== undefined) {
      state.creditsRemaining = result.creditsRemaining;
      updateCreditsUI();
    }
    
    el.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    console.error('Analysis failed:', err);
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

function showError(msg) {
  console.error('UI Error Display:', msg);
  
  let userMsg = msg;
  if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
    userMsg = "The AI Network is currently experiencing heavy institutional volume. Please wait 10-20 seconds and try again.";
  }

  alert(`⚠️ Analysis Status\n\n${userMsg}`);
}

function setLoading(val) {
  state.isAnalyzing = val;
  el.analyzeBtn.disabled = val;
  el.spinner.classList.toggle('hidden', !val);
  el.analyzeBtnText.textContent = val ? 'Analyzing Network...' : 'Analyze Chart';
}

async function callGemini(base64Data, ticker, timeframe) {
  const imageData = base64Data.split(',')[1];
  
  const PROMPT = `Analyze this trading chart for ${ticker} (${timeframe}). 
    ACT AS A SENIOR INSTITUTIONAL ANALYST.
    
    1. TREND: Bullish / Bearish / Sideways
    2. RSI: Estimated value (e.g. 58)
    3. VOLATILITY: Low / Medium / High
    4. SMC_STATUS: BOS / CHoCH / Neutral
    5. TARGETS: [TP1, TP2, TP3]
    
    Output JSON Schema (STRICT):
    {
      "verdict": "BUY / SELL / HOLD",
      "confidence_score": 0-100,
      "key_signals": [{"type": "bullish / bearish", "text": "Detail"}],
      "indicators": {"trend": "...", "rsi": "...", "volatility": "...", "smc_status": "..."},
      "price_levels": {"entry": "...", "stop_loss": "...", "tp_targets": ["...", "...", "..."], "support": "...", "resistance": "..."},
      "reasoning": "...", "risk_note": "..."
    }`;

  const response = await fetch(CONFIG.BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gemini-2.0-flash",
      contents: [{
        parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: imageData } }]
      }],
      generationConfig: { response_mime_type: "application/json" }
    })
  }).catch(err => {
    // Catch browser-level fetch errors (Network down, CORS, Firewall)
    console.error('Fetch aborted or network error:', err);
    throw new Error('Connection failed. Please ensure the backend server is running on port 3005.');
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const msg = errData.error?.message || 'Server 404/Connection Failed';
    const status = response.status;
    
    if (errData.error?.isLeaked) {
      const modalMsg = '🚨 SECURITY ALERT: Your Gemini API Key has been reported as LEAKED or DISABLED by Google. Please generate a NEW key at [aistudio.google.com] and update your .env file.';
      alert(modalMsg);
      throw new Error('Leaked API Key');
    }

    if (status === 403) throw new Error('Out of free credits or model restricted. Update to PRO.');
    if (status === 500 && msg.includes('API Key')) throw new Error('Backend error: Gemini API Key is missing. Check .env');
    
    throw new Error(`${msg} (Status: ${status})`);
  }

  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0) {
    console.error('Gemini API Empty Response:', data);
    const reason = data.promptFeedback?.blockReason || 'No candidates returned (Safety or Model error)';
    throw new Error(`Gemini Error: ${reason}`);
  }

  const rawText = data.candidates[0].content.parts[0].text;
  console.log('Raw AI Response:', rawText);
  
  const cleanJson = extractJson(rawText);
  let parsed = JSON.parse(cleanJson);
  
  // Normalize Keys (Handle camelCase or snake_case variations from the AI)
  parsed = normalizeAiResponse(parsed);

  return { ...parsed, creditsRemaining: data.creditsRemaining };
}

/**
 * Normalizes common key variations seen in different Gemini model versions.
 */
function normalizeAiResponse(data) {
  const norm = { ...data };
  
  // Normalizing Verdict
  if (!norm.verdict) norm.verdict = norm.Verdict || norm.signal || 'HOLD';
  norm.verdict = String(norm.verdict).toUpperCase().split(' ')[0].replace(/[^A-Z]/g, '');
  if (!['BUY', 'SELL', 'HOLD'].includes(norm.verdict)) norm.verdict = 'HOLD';

  // Normalizing Confidence
  norm.confidence_score = parseInt(norm.confidence_score || norm.confidenceScore || norm.confidence || 75);
  if (isNaN(norm.confidence_score)) norm.confidence_score = 75;

  // Normalizing Signals
  norm.key_signals = norm.key_signals || norm.keySignals || norm.signals || [];
  if (!Array.isArray(norm.key_signals)) norm.key_signals = [];

  // Normalizing Indicators (V5 Deep)
  const rawInd = data.indicators || data.Indicators || data.technical || {};
  norm.indicators = {
    trend: rawInd.trend || rawInd.Trend || 'Institutional Neutral',
    rsi: rawInd.rsi || rawInd.RSI || '50.0',
    volatility: rawInd.volatility || rawInd.Volatility || 'Stable',
    smc_status: rawInd.smc_status || rawInd.smcStatus || 'No Signal'
  };

  // Normalizing Setup (V5 Deep)
  const rawLevels = data.price_levels || data.priceLevels || data.levels || {};
  const rawTps = Array.isArray(rawLevels.tp_targets) ? rawLevels.tp_targets : (Array.isArray(rawLevels.targets) ? rawLevels.targets : []);
  
  norm.price_levels = {
    entry: rawLevels.entry || rawLevels.Entry || 'Market Context',
    stop_loss: rawLevels.stop_loss || rawLevels.stopLoss || 'Structural Protected',
    tp_targets: [rawTps[0] || 'TP1', rawTps[1] || 'TP2', rawTps[2] || 'TP3'],
    support: rawLevels.support || 'Dynamic Support',
    resistance: rawLevels.resistance || 'Order Block Range'
  };

  // Normalizing Text
  norm.reasoning = data.reasoning || data.Reasoning || 'Analysis technical confirmation is pending.';
  norm.risk_note = data.risk_note || data.riskNote || 'Standard risk management applies.';
  
  return norm;
}

/**
 * Robustly extracts JSON from an AI response, stripping Markdown code blocks if present.
 */
function extractJson(text) {
  // Try to find the first occurrence of a JSON block
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  // Fallback: use the original text and hope it's clean
  return text.trim();
}

// ─── RENDERING ───
function renderResults(data, ticker, tf) {
  el.resultsPlaceholder.classList.add('hidden');
  el.resultsContent.classList.remove('hidden');
  
  el.verdictBadge.textContent = data.verdict;
  el.verdictBadge.className = `verdict-badge ${data.verdict.toLowerCase()}`;
  el.verdictTicker.textContent = ticker;
  el.verdictTf.textContent = tf;
  
  el.confidencePct.textContent = `${data.confidence_score}%`;
  const offset = 163.4 - (163.4 * (data.confidence_score / 100));
  el.ringFill.style.strokeDashoffset = offset;
  
  if (data.verdict === 'BUY') el.ringFill.style.stroke = 'var(--green)';
  else if (data.verdict === 'SELL') el.ringFill.style.stroke = 'var(--red)';
  else el.ringFill.style.stroke = 'var(--yellow)';

  try {
    el.pillsRow.innerHTML = (data.key_signals || []).map(s => {
      const type = (s.type || 'neutral').toLowerCase();
      const text = s.text || 'Technical confirmation';
      return `<span class="pill ${type}">${text}</span>`;
    }).join('');
  } catch (e) { console.warn('Pills fail:', e); }

  try {
    el.levelsGrid.innerHTML = `
      <div class="level-item support"><div class="level-label">Support</div><div class="level-value">${data.price_levels.support}</div></div>
      <div class="level-item resistance"><div class="level-label">Resistance</div><div class="level-value">${data.price_levels.resistance}</div></div>
      <div class="level-item target"><div class="level-label">Target</div><div class="level-value">${data.price_levels.tp_targets[1]}</div></div>
      <div class="level-item stop"><div class="level-label">Stop Loss</div><div class="level-value">${data.price_levels.stop_loss}</div></div>
    `;
  } catch (e) { console.warn('Levels fail:', e); }

  el.reasoningBox.textContent = data.reasoning;
  el.riskRow.innerHTML = `<strong>⚠️ Risk Factor:</strong> ${data.risk_note}`;

  // Indicators Grid (V5 Safe Render)
  try {
    el.metricTrend.textContent = data.indicators.trend;
    el.metricRsi.textContent = data.indicators.rsi;
    el.metricVol.textContent = data.indicators.volatility;
    el.metricSmc.textContent = data.indicators.smc_status;
    
    if (data.indicators.trend.toLowerCase().includes('bull')) el.metricTrend.className = 'metric-value bull';
    else if (data.indicators.trend.toLowerCase().includes('bear')) el.metricTrend.className = 'metric-value bear';
  } catch (e) { console.warn('Metrics fail:', e); }

  // Trade Setup Architect (V5 Safe Render)
  try {
    el.setupEntry.textContent = data.price_levels.entry;
    el.setupSl.textContent = data.price_levels.stop_loss;
    el.tp1.textContent = data.price_levels.tp_targets[0];
    el.tp2.textContent = data.price_levels.tp_targets[1];
    el.tp3.textContent = data.price_levels.tp_targets[2];
    calculateRR(data.price_levels);
  } catch (e) { console.warn('Architect fail:', e); }

  // Reset Chat for new analysis
  el.chatMessages.innerHTML = `
    <div class="chat-bubble ai">
      Analysis complete for ${ticker}. You can ask me follow-up questions about this setup or institutional levels.
    </div>
  `;
}

// ─── V5 ELITE MODULES (SCREENER & CHAT) ───

async function initScreener() {
  updateScreener();
  setInterval(updateScreener, 10000); // 10s refresh for 'Institutional' feel
}

async function updateScreener() {
  if (!el.screenerBody) return;
  
  try {
    const res = await fetch(CONFIG.SCREENER_URL);
    const data = await res.json();
    
    el.screenerBody.innerHTML = data.map(coin => {
      const price = parseFloat(coin.lastPrice).toLocaleString(undefined, { minimumFractionDigits: 2 });
      const change = parseFloat(coin.priceChangePercent);
      const changeClass = change >= 0 ? 'price-up' : 'price-down';
      const indicator = change >= 2 ? 'BUY' : change <= -2 ? 'SELL' : 'NEUTRAL';
      const signalClass = indicator.toLowerCase();
      
      return `
        <tr>
          <td>
            <div class="ticker-name">
              ${coin.symbol.replace('USDT', '')}
              <span class="ticker-symbol">/USDT</span>
            </div>
          </td>
          <td class="font-mono">${price}</td>
          <td class="${changeClass} font-mono">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</td>
          <td><span class="signal-badge ${signalClass}">${indicator}</span></td>
          <td class="font-mono text-dim" style="font-size: 11px;">${Math.abs(change) > 4 ? 'HIGH' : 'STABLE'}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn('Screener fetch failed (CORS or Network):', err);
  }
}

async function sendChat() {
  const msg = el.chatInput.value.trim();
  if (!msg || state.isAnalyzing) return;
  
  // Append User message
  appendMessage('user', msg);
  el.chatInput.value = '';
  
  // Loading bubble
  const loadingId = 'ai-loading-' + Date.now();
  el.chatMessages.innerHTML += `<div class="chat-bubble ai" id="${loadingId}">Thinking...</div>`;
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;

  try {
    const ticker = el.verdictTicker.textContent || 'Unknown Ticker';
    const context = el.reasoningBox.textContent;
    
    const PROMPT = `You are TradeGPT, an institutional analyst assistant. 
    Context: The user is looking at an analysis of ${ticker} on ${el.verdictTf.textContent || 'Unknown'} timeframe. 
    Previous Analysis Summary: ${context}.
    ${el.riskRow.textContent}
    Question: ${msg}.
    Reply concisely as a senior Bloomberg analyst. Focus on technical confirmations and volume profiles. No greetings.`;

    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemini-2.0-flash", // Use 2.0 Flash for speed in chat
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.7 }
      })
    });

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that request.";
    
    document.getElementById(loadingId).remove();
    appendMessage('ai', aiResponse);
    
  } catch (err) {
    document.getElementById(loadingId).textContent = "Error connecting to AI Network.";
  }
}

function appendMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  el.chatMessages.appendChild(bubble);
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
}

function calculateRR(levels) {
  if (!el.rrRatio) return;
  
  const entry = parseFloat(levels.entry.replace(/[^0-9.]/g, ''));
  const sl = parseFloat(levels.stop_loss.replace(/[^0-9.]/g, ''));
  const tp3 = levels.tp_targets && levels.tp_targets[2] ? parseFloat(levels.tp_targets[2].replace(/[^0-9.]/g, '')) : null;

  if (isNaN(entry) || isNaN(sl) || isNaN(tp3)) {
    el.rrRatio.textContent = '1:--';
    return;
  }

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp3 - entry);
  const ratio = (reward / risk).toFixed(2);
  
}

function showComingSoon(feature) {
  const modal = document.getElementById('comingSoonModal');
  const title = document.getElementById('csFeatureName');
  if (modal && title) {
    title.textContent = `${feature}`;
    modal.classList.remove('hidden');
  }
}

async function playTerminalSequence() {
  el.terminalOverlay.classList.remove('hidden');
  el.terminalBody.innerHTML = '';
  
  const lines = [
    `> INITIALIZING INSTITUTIONAL AI CORE...`,
    `> CONNECTING TO CHATSENSE DEEP-LIQUIDITY API...`,
    `> SCANNING CANDLESTICK VOLATILITY PROFILES...`,
    `> DETECTING MARKET STRUCTURE (SMC)...`,
    `> SEARCHING FOR ORDER BLOCKS & LIQUIDITY VOIDS...`,
    `> CALCULATING INSTITUTIONAL WIN PROBABILITY...`,
    `> GENERATING VERIFIED REPORT...`
  ];
  
  for (const line of lines) {
    const div = document.createElement('div');
    div.className = 'term-line';
    div.textContent = line;
    el.terminalBody.appendChild(div);
    await new Promise(r => setTimeout(r, 400));
  }
  
  await new Promise(r => setTimeout(r, 600));
  el.terminalOverlay.classList.add('hidden');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

init();
