console.log('elite-v4.js loaded');
console.log('--- CHARTSENSE BOOTING ---');
const CONFIG = {
  DEFAULT_MODEL: 'gemini-3-flash-preview',
  BACKEND_URL: '/api/analyze',
  STATUS_URL: '/api/status',
  CHECKOUT_URL: '/api/create-checkout-session', // Real Stripe redirect endpoint
  HEALTH_URL: '/api/health',
  SCREENER_URL: '/api/screener',
  HISTORY_URL: '/api/history'
};

// ─── FIREBASE CONFIG (TEMPLATE) ───
// These will be populated from Saas_LAUNCH_GUIDE.md instructions
const firebaseConfig = {
  apiKey: "AIzaSyDpXljLX8gyjwFQfvqTkYOKga7EC79gTgk",
  authDomain: "chartsense-ce27a.firebaseapp.com",
  projectId: "chartsense-ce27a",
  storageBucket: "chartsense-ce27a.firebasestorage.app",
  messagingSenderId: "382076085918",
  appId: "1:382076085918:web:b929454acc8496eb9d3d8f",
};

// Initialize Firebase if not already
if (typeof firebase !== 'undefined') {
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
}

// ─── STATE ───
let state = {
  model: CONFIG.DEFAULT_MODEL,
  creditsRemaining: 3,
  isPro: false,
  user: null, // User object for Auth
  authUnsubscribe: null,
  selectedFile: null,
  isAnalyzing: false,
  healthChecked: false,
  pendingAction: null, // V5: Track intent across Auth flows
  authMode: 'login', // 'login' or 'register'
  billingCycle: 'monthly' // 'monthly' or 'yearly'
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
  rrRatio: document.getElementById('rrRatio'),

  // V5 History Elements
  historyPanel: document.getElementById('historyPanel'),
  historyList: document.getElementById('historyList'),
  historyBtn: document.getElementById('historyBtn'),
  closeHistory: document.getElementById('closeHistory'),
  copySetupBtn: document.getElementById('copySetupBtn'),

  // Auth Modal Elements
  authTitle: document.getElementById('authTitle'),
  authDesc: document.getElementById('authDesc'),
  signInBtn: document.getElementById('signInBtn'),
  googleBtn: document.getElementById('googleBtn'),
  toSignUp: document.getElementById('toSignUp'),
  authSwitch: document.getElementById('authSwitch'),
  
  // Settings
  openSettings: document.getElementById('openSettings'),
  closeSettings: document.getElementById('closeSettings'),
  settingsModal: document.getElementById('settingsModal'),
  manageSubBtn: document.getElementById('manageSubBtn'),
  billingToggle: document.getElementById('billingToggle'),
  headerUpgradeBtn: document.getElementById('headerUpgradeBtn'),
  headerSettingsBtn: document.getElementById('headerSettingsBtn'),
  
  // Settings detail elements
  settingsEmail: document.getElementById('settingsEmail'),
  settingsPlanBadge: document.getElementById('settingsPlanBadge'),
  settingsCredits: document.getElementById('settingsCredits'),
  settingsUID: document.getElementById('settingsUID'),
  settingsVerificationBadge: document.getElementById('settingsVerificationBadge'),
  settingsVerificationText: document.getElementById('settingsVerificationText'),
  refreshStatusBtn: document.getElementById('refreshStatusBtn'),
  sendVerificationBtn: document.getElementById('sendVerificationBtn'),
  resendVerificationBtn: document.getElementById('resendVerificationBtn'),
  resetPasswordBtn: document.getElementById('resetPasswordBtn')
};

// ─── INIT ───
async function init() {
  console.log('--- INITIALIZING ELITE CORE ---');
  hydrateElements(); 
  
  if (!el.completeCheckout) {
    console.error('CRITICAL: completeCheckout button not found in DOM.');
  } else {
    console.log('SUCCESS: completeCheckout button bound.');
  }

  setupEventListeners(); 
  checkUrlParams();
  checkHealth(); 
  setupAuthListener();
  startLiveStats();
  initScreener();
  console.log("%c CHARTSENSE ELITE V5 ACTIVE ", "background: #8b5cf6; color: white; font-weight: bold; border-radius: 4px; padding: 2px 8px;");
}

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const sessionId = params.get('session_id');
  if (status === 'success') {
    alert('✨ INSTITUTIONAL ACCESS GRANTED. Welcome to the Elite tier.');
    if (sessionId) {
      localStorage.setItem('pendingStripeSessionId', sessionId);
    }
    // Clean up URL (keep hash routing intact)
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  } else if (status === 'cancel') {
    console.log('Institutional checkout aborted by user.');
  }
}

// setupAuthListener moved to unified definition below

function hydrateElements() {
  for (const key in el) {
    if (el[key] === null || el[key] === undefined || (el[key] instanceof HTMLElement && !document.contains(el[key]))) {
      el[key] = document.getElementById(key);
    }
  }
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
    const headers = {};
    if (state.user) {
      const token = await firebase.auth().currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(CONFIG.STATUS_URL, { headers });
    if (!response.ok) throw new Error('Network error');

    const data = await response.json();
    state.creditsRemaining = data.creditsRemaining;
    state.isPro = data.isPro;
    updateCreditsUI();
    checkAnalyzeStatus();
  } catch (e) {
    console.warn('Backend sync deferred: using local state (Pro Trial Mode)');
    updateCreditsUI();
  }
}

function setupEventListeners() {
  // Upload handlers (guarded so missing DOM doesn't break everything)
  if (el.dropzone && el.fileInput) {
    el.dropzone.onclick = () => el.fileInput.click();
    el.fileInput.onchange = (e) => handleFile(e.target.files[0]);

    el.dropzone.ondragover = (e) => { e.preventDefault(); el.dropzone.classList.add('drag-over'); };
    el.dropzone.ondragleave = () => el.dropzone.classList.remove('drag-over');
    el.dropzone.ondrop = (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('drag-over');
      handleFile(e.dataTransfer.files[0]);
    };
  }

  // Analysis
  if (el.analyzeBtn) el.analyzeBtn.onclick = startAnalysis;

  // Auth Handlers
  console.log('Attaching auth listeners...', !!el.authForm);
  if (el.openAuth) el.openAuth.onclick = () => el.authModal.classList.remove('hidden');
  if (el.closeAuth) el.closeAuth.onclick = () => el.authModal.classList.add('hidden');
  if (el.authForm) el.authForm.onsubmit = handleAuthSubmit;
  if (el.googleBtn) el.googleBtn.onclick = handleGoogleLogin;
  if (el.userAvatar) el.userAvatar.onclick = () => el.userMenu.classList.toggle('hidden');
  if (el.logoutBtn) el.logoutBtn.onclick = (e) => {
    e.preventDefault();
    logout();
  };
  
  if (el.openSettings) el.openSettings.onclick = (e) => {
    e.preventDefault();
    if (el.userMenu) el.userMenu.classList.add('hidden');
    syncSettingsUI();
    if (el.settingsModal) {
      el.settingsModal.classList.remove('hidden');
    }
  };
  if (el.closeSettings) el.closeSettings.onclick = () => el.settingsModal.classList.add('hidden');
  if (el.manageSubBtn) el.manageSubBtn.onclick = handleManageSubscription;
  if (el.sendVerificationBtn) el.sendVerificationBtn.onclick = handleSendVerificationEmail;
  if (el.resendVerificationBtn) el.resendVerificationBtn.onclick = handleResendVerificationFromMenu;
  if (el.resetPasswordBtn) el.resetPasswordBtn.onclick = handleResetPassword;
  if (el.toSignUp) {
    el.toSignUp.onclick = (e) => { 
      e.preventDefault(); 
      console.log('Toggling auth mode...');
      toggleAuthMode(); 
    };
  }

  // Checkout Handlers
  if (el.upgradeBtn) el.upgradeBtn.onclick = () => {
    if (!state.user) {
      state.pendingAction = 'checkout';
      el.authModal.classList.remove('hidden');
    } else if (state.isPro) {
      alert('✨ Your Elite Pro access is currently active.');
    } else {
      el.checkoutModal.classList.remove('hidden');
    }
  };
  if (el.closeCheckout) el.closeCheckout.onclick = () => el.checkoutModal.classList.add('hidden');
  if (el.completeCheckout) el.completeCheckout.onclick = handlePayment;
  if (el.exportPdfBtn) el.exportPdfBtn.onclick = exportToPdf;

  // Billing Toggle
  if (el.billingToggle) {
    const options = el.billingToggle.querySelectorAll('.toggle-option');
    options.forEach(opt => {
      opt.onclick = () => {
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        state.billingCycle = opt.dataset.plan;
        
        // Update price display
        const amount = document.querySelector('.price-display .amount');
        const period = document.querySelector('.price-display .period');
        if (state.billingCycle === 'yearly') {
          amount.textContent = '279';
          period.textContent = '/ year';
        } else {
          amount.textContent = '29';
          period.textContent = '/ month';
        }
      };
    });
  }

  if (el.refreshStatusBtn) el.refreshStatusBtn.onclick = handleRefreshStatus;
  
  // Chat Handlers
  if (el.chatSendBtn) el.chatSendBtn.onclick = sendChat;
  if (el.chatInput) el.chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendChat(); };

  // History Handlers
  if (el.historyBtn) el.historyBtn.onclick = (e) => {
    e.preventDefault();
    if (el.userMenu) el.userMenu.classList.add('hidden');
    if (el.historyPanel) {
      el.historyPanel.classList.remove('hidden');
      el.historyPanel.scrollIntoView({ behavior: 'smooth' });
    }
    // Try to load history, but don't block the UI if it fails
    fetchHistory().catch((err) => {
      console.warn('History fetch failed:', err?.message || err);
    });
  };
  if (el.closeHistory) el.closeHistory.onclick = () => el.historyPanel?.classList.add('hidden');

  // Ticket Actions
  if (el.copySetupBtn) el.copySetupBtn.onclick = copySetupToClipboard;

  // Generic close for modals and menus
  window.onclick = (event) => {
    if (event.target === el.authModal) el.authModal?.classList.add('hidden');
    if (event.target === el.checkoutModal) el.checkoutModal?.classList.add('hidden');
    const comingSoon = document.getElementById('comingSoonModal');
    if (event.target === comingSoon) comingSoon?.classList.add('hidden');
    if (!event.target.closest('#userProfile') && el.userMenu) el.userMenu.classList.add('hidden');
  };
}

// ─── AUTH LOGIC ───
function setupAuthListener() {
  if (typeof firebase === 'undefined') return;
  
  firebase.auth().onAuthStateChanged(async (user) => {
    console.log('Auth state change detected:', user ? user.email : 'LOGGED_OUT');
    state.user = user;
    
    if (user) {
      // Always refresh server-side claims first
      await user.reload().catch(() => {});
      state.user = firebase.auth().currentUser;

      // HARD MODE: block all unverified users from staying logged in
      if (!isUserVerified(state.user)) {
        try {
          await sendVerificationEmail(state.user);
        } catch (e) {
          console.warn('Verification email send failed on auth state:', e?.message);
        }
        alert('For security, you must verify your email before using ChartSense.\n\nWe just sent a verification link to your inbox. Click it, then sign in again.');
        await firebase.auth().signOut();
        return;
      }

      console.log('Institutional session active (verified):', state.user.email);
      await syncStatus(); // Sync Pro/Credits from Firestore

      // Fallback fulfillment: if checkout succeeded but webhook didn't run yet,
      // finalize Pro activation using the Stripe session_id.
      const pendingSessionId = localStorage.getItem('pendingStripeSessionId');
      if (pendingSessionId) {
        try {
          const token = await firebase.auth().currentUser.getIdToken();
          const resp = await fetch(`/api/fulfill-checkout-session?session_id=${encodeURIComponent(pendingSessionId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (resp.ok) {
            localStorage.removeItem('pendingStripeSessionId');
            await syncStatus();
            alert('✨ SUCCESS: Elite Pro activated. Your institutional access is now live.');
          } else {
            const err = await resp.json().catch(() => ({}));
            console.warn('Fulfillment failed:', err?.error || resp.status);
          }
        } catch (e) {
          console.warn('Fulfillment request failed:', e?.message || e);
        }
      }
    } else {
      console.log('Awaiting institutional login...');
      state.isPro = false;
      state.creditsRemaining = 3;
    }

    updateAuthUI();
    
    if (user && state.pendingAction === 'checkout') {
      state.pendingAction = null;
      el.checkoutModal.classList.remove('hidden');
    }
  });
}

function toggleAuthMode() {
  state.authMode = state.authMode === 'login' ? 'register' : 'login';
  console.log('Switching Auth Mode to:', state.authMode);

  if (state.authMode === 'register') {
    el.authTitle.textContent = 'Create Elite Account';
    el.authDesc.textContent = 'Join 50,000+ traders and get institutional-grade AI analysis.';
    el.signInBtn.textContent = 'Create Account';
    el.authSwitch.innerHTML = 'Already have an account? <a href="#" id="toSignIn">Sign in</a>';
    
    // Bind the NEWLY created toSignIn link
    const toSignIn = document.getElementById('toSignIn');
    if (toSignIn) toSignIn.onclick = (e) => { e.preventDefault(); toggleAuthMode(); };
  } else {
    el.authTitle.textContent = 'Welcome Back';
    el.authDesc.textContent = 'Sign in to save your Pro status and analysis history.';
    el.signInBtn.textContent = 'Sign In';
    el.authSwitch.innerHTML = "Don't have an account? <a href=\"#\" id=\"toSignUp\">Sign up</a>";
    
    // Bind the NEWLY created toSignUp link and update el reference
    el.toSignUp = document.getElementById('toSignUp');
    if (el.toSignUp) el.toSignUp.onclick = (e) => { e.preventDefault(); toggleAuthMode(); };
  }
}

function openSettingsModal() {
  syncSettingsUI();
  if (el.settingsModal) el.settingsModal.classList.remove('hidden');
}

function syncSettingsUI() {
  if (!state.user) return;
  
  el.settingsEmail.textContent = state.user.email;
  el.settingsUID.textContent = state.user.uid;
  const isVerified = isUserVerified(state.user);

  if (isVerified) {
    el.settingsVerificationBadge.textContent = 'Verified';
    el.settingsVerificationBadge.classList.add('pro');
    el.settingsVerificationText.textContent = 'Your email has been verified and your account is fully secured.';
    el.sendVerificationBtn.classList.add('hidden');
  } else {
    el.settingsVerificationBadge.textContent = 'Pending';
    el.settingsVerificationBadge.classList.remove('pro');
    el.settingsVerificationText.textContent = 'Verify your email before using account-only features and checkout.';
    el.sendVerificationBtn.classList.remove('hidden');
  }
  
  if (state.isPro) {
    el.settingsPlanBadge.textContent = 'ELITE PRO';
    el.settingsPlanBadge.classList.add('pro');
    el.settingsCredits.textContent = 'Unlimited access active';
  } else {
    el.settingsPlanBadge.textContent = 'STARTER';
    el.settingsPlanBadge.classList.remove('pro');
    el.settingsCredits.textContent = `${state.creditsRemaining} analyses remaining`;
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  console.log('Auth submit triggered! Mode:', state.authMode);
  
  const email = document.getElementById('authEmail').value;
  const pass = document.getElementById('authPass').value;
  const btn = el.signInBtn;

  if (typeof firebase === 'undefined') {
    console.error('CRITICAL: Firebase SDK missing.');
    return alert('Institutional Network Offline (Firebase SDK Missing).');
  }

  console.log('Authenticating:', email, state.authMode);
  btn.disabled = true;
  btn.textContent = state.authMode === 'login' ? 'AUTHENTICATING...' : 'CREATING ACCOUNT...';

  try {
    if (state.authMode === 'login') {
      const credential = await firebase.auth().signInWithEmailAndPassword(email, pass);
      await credential.user.reload();
      if (!isUserVerified(credential.user)) {
        await firebase.auth().signOut();
        await sendVerificationEmail(credential.user);
        throw new Error('Please verify your email before signing in. We sent a fresh verification link to your inbox.');
      }
    } else {
      const credential = await firebase.auth().createUserWithEmailAndPassword(email, pass);
      await sendVerificationEmail(credential.user);
      await firebase.auth().signOut();
      alert('Account created. Check your inbox and verify your email before signing in.');
      toggleAuthMode();
      return;
    }
    
    console.log('Auth success!');
    el.authModal.classList.add('hidden');
  } catch (err) {
    console.error('Auth Error Detailed:', err);
    alert(`Authentication Error: [${err.code || 'auth/error'}] ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = state.authMode === 'login' ? 'Sign In' : 'Create Account';
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

// V5: Google Auth
async function handleGoogleLogin() {
  if (typeof firebase === 'undefined') return;
  console.log('Initiating Google Login...');
  const provider = new firebase.auth.GoogleAuthProvider();
  
  try {
    const result = await firebase.auth().signInWithPopup(provider);
    console.log('Google login valid:', result.user.email);
    el.authModal.classList.add('hidden');
    updateAuthUI();
  } catch (err) {
    console.error('Google Auth Failed Detail:', err);
    
    if (err.code === 'auth/unauthorized-domain') {
      const currentDomain = window.location.hostname;
      alert(`⚠️ DOMAIN NOT AUTHORIZED\n\nYour domain (${currentDomain}) is not whitelisted in the Firebase Console.\n\nFIX STEPS:\n1. Go to Firebase Console\n2. Authentication -> Settings -> Authorized domains\n3. Add "${currentDomain}" to the list.\n4. Wait 1 minute and try again.`);
    } else if (err.code === 'auth/popup-closed-by-user') {
      console.log('User closed auth popup.');
    } else if (err.code === 'auth/cancelled-popup-request') {
      console.log('Multiple popups requested.');
    } else {
      alert(`Institutional connection denied: ${err.message}`);
    }
  }
}

function updateAuthUI() {
  if (state.authUnsubscribe) {
    state.authUnsubscribe();
    state.authUnsubscribe = null;
  }

  if (state.user) {
    el.openAuth.classList.add('hidden');
    el.userProfile.classList.remove('hidden');
    el.userEmailAddress.textContent = state.user.email;
    el.userAvatar.textContent = state.user.email.charAt(0).toUpperCase();
    if (!isUserVerified(state.user)) {
      el.resendVerificationBtn.classList.remove('hidden');
    } else {
      el.resendVerificationBtn.classList.add('hidden');
    }
    
    // Ensure email is tracked in Firestore for lookup
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(state.user.uid);
    userRef.set({ 
      email: state.user.email,
      emailVerified: isUserVerified(state.user),
      lastLogin: new Date().toISOString() 
    }, { merge: true });

    // Auto-sync status from Firestore on login
    console.log('--- STARTING PRO STATUS SYNC (Firestore) ---');
    state.authUnsubscribe = userRef.onSnapshot(doc => {
      console.log('Firestore update detected for user:', state.user.uid);
      if (doc.exists) {
        const data = doc.data();
        console.log('Current Firestore Data:', data);
        
        // Final Fallback: Check if they are in the pro_backlog (due to pre-sync payment)
        if (!data.isPro) {
          db.collection('pro_backlog').doc(state.user.email.toLowerCase()).get().then(backDoc => {
            if (backDoc.exists) {
              console.log('✨ MATCH FOUND IN PRO BACKLOG! Migrating user to Pro status...');
              const backData = backDoc.data();
              userRef.set({
                isPro: true,
                stripeCustomer: backData.stripeCustomer,
                subscriptionId: backData.subscriptionId
              }, { merge: true });
              // Backlog entry is no longer needed
              backDoc.ref.delete();
            }
          });
        }

        state.isPro = data.isPro || false;
        state.creditsRemaining = data.creditsRemaining !== undefined ? data.creditsRemaining : state.creditsRemaining;
        
        if (state.isPro) {
          console.log('%c UPGRADE DETECTED: User is now ELITE PRO. ', 'background: #00ff00; color: #000; font-weight: bold;');
        }
        
        updateCreditsUI();
        syncSettingsUI();
      } else {
        console.warn('No Firestore document found for user yet.');
        // If no doc exists, create it with email for future lookups
        userRef.set({ email: state.user.email, emailVerified: isUserVerified(state.user), creditsRemaining: 3, isPro: false });
      }
    }, err => {
      console.error('Firestore Sync Error:', err);
    });
  } else {
    el.openAuth.classList.remove('hidden');
    el.userProfile.classList.add('hidden');
    el.userMenu.classList.add('hidden');
  }
}

async function logout() {
  if (state.authUnsubscribe) {
    state.authUnsubscribe();
    state.authUnsubscribe = null;
  }

  if (typeof firebase !== 'undefined') {
    await firebase.auth().signOut();
  }
  state.user = null;
  state.isPro = false;
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
  const pricingBtn = document.querySelector('#pricing .price-card.featured .btn-primary');

  if (state.isPro) {
    el.creditsCount.textContent = '∞';
    el.creditsCount.style.color = 'var(--purple)';
    
    // Update Header Buttons
    if (el.headerUpgradeBtn) el.headerUpgradeBtn.classList.add('hidden');
    if (el.headerSettingsBtn) el.headerSettingsBtn.classList.remove('hidden');

    if (el.upgradeBtn) {
      el.upgradeBtn.innerHTML = '✨ Pro Active';
      el.upgradeBtn.classList.add('pro-active');
      el.upgradeBtn.disabled = true;
    }

    if (pricingBtn) {
      pricingBtn.innerHTML = '✨ Plan Active';
      pricingBtn.classList.add('pro-active');
      pricingBtn.disabled = true;
    }

    el.paywallOverlay.classList.add('hidden');
    return;
  }

  // Restore Header Buttons if not Pro
  if (el.headerUpgradeBtn) el.headerUpgradeBtn.classList.remove('hidden');
  if (el.headerSettingsBtn) el.headerSettingsBtn.classList.add('hidden');
  
  el.creditsCount.textContent = state.creditsRemaining;

  if (state.creditsRemaining <= 0) {
    el.creditsCount.classList.add('out');
    el.paywallOverlay.classList.remove('hidden');
  } else {
    el.creditsCount.classList.remove('out');
    el.paywallOverlay.classList.add('hidden');
  }
}

async function handleRefreshStatus() {
  if (!state.user) return;
  const btn = el.refreshStatusBtn;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';

  try {
    const db = firebase.firestore();
    const doc = await db.collection('users').doc(state.user.uid).get();
    
    if (doc.exists) {
      const data = doc.data();
      state.isPro = data.isPro || false;
      state.creditsRemaining = data.creditsRemaining !== undefined ? data.creditsRemaining : state.creditsRemaining;
      
      updateCreditsUI();
      syncSettingsUI();

      if (state.isPro) {
        alert('✨ SUCCESS: Elite Pro status verified. Your institutional access is active.');
      } else {
        alert('Status verified: No active subscription found in your institutional record yet. If you recently paid, please wait 60 seconds and refresh.');
      }
    }
  } catch (err) {
    alert('Failed to refresh status: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Subscription Status';
  }
}

function checkAnalyzeStatus() {
  const hasImage = !!state.selectedFile;
  const hasCredits = state.creditsRemaining > 0 || state.isPro;
  el.analyzeBtn.disabled = !hasImage || !hasCredits || state.isAnalyzing;
}

function isUserVerified(user) {
  if (!user) return false;
  const providerIds = (user.providerData || []).map((provider) => provider.providerId);
  return Boolean(user.emailVerified || providerIds.includes('google.com'));
}

async function sendVerificationEmail(user) {
  if (!user || isUserVerified(user)) return;
  await user.sendEmailVerification();
}

async function handleSendVerificationEmail(e) {
  if (e) e.preventDefault();
  const user = firebase.auth().currentUser;
  if (!user) return;

  try {
    await sendVerificationEmail(user);
    alert(`Verification email sent to ${user.email}. Open it, verify your account, then sign in again.`);
  } catch (err) {
    alert('Could not send verification email: ' + err.message);
  }
}

async function handleResendVerificationFromMenu(e) {
  if (e) e.preventDefault();
  el.userMenu.classList.add('hidden');
  await handleSendVerificationEmail();
}

async function handleResetPassword(e) {
  if (e) e.preventDefault();
  const email = state.user?.email || document.getElementById('authEmail').value.trim();
  if (!email) {
    alert('Enter your email first so we can send the reset link.');
    return;
  }

  try {
    await firebase.auth().sendPasswordResetEmail(email);
    alert(`Password reset link sent to ${email}.`);
  } catch (err) {
    alert('Password reset failed: ' + err.message);
  }
}

// ─── MONETIZATION LOGIC ───
async function handlePayment() {
  if (!state.user) {
    state.pendingAction = 'checkout';
    el.authModal.classList.remove('hidden');
    return;
  }

  if (!isUserVerified(state.user)) {
    alert('Verify your email before starting checkout. We can resend the verification email from Account Settings.');
    return;
  }

  const btn = el.completeCheckout;
  btn.disabled = true;
  btn.textContent = 'REDIRECTING TO SECURE CHECKOUT...';

  // Find the right price ID. In prod, you should use environment variables.
  const MONTHLY_PRICE = 'price_1TMSI6V05gkWPOqDDhDusUlG';
  const YEARLY_PRICE = 'price_1Q5...YOUR_YEARLY_ID_HERE'; // User needs to update this
  
  const selectedPrice = state.billingCycle === 'yearly' ? YEARLY_PRICE : MONTHLY_PRICE;

  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: state.user.uid,
        userEmail: state.user.email,
        priceId: selectedPrice
      })
    });

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Could not initiate institutional checkout.');
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Start Your Subscription';
  }
}

async function handleManageSubscription() {
  const user = firebase.auth().currentUser;
  if (!user) return;

  if (!isUserVerified(user)) {
    alert('Verify your email before opening subscription management.');
    return;
  }

  const originalText = el.manageSubBtn.textContent;
  el.manageSubBtn.textContent = 'OPENING BILLING PORTAL...';
  el.manageSubBtn.disabled = true;

  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/create-portal-session', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Upgrade to Pro first to manage subscription.');
    }
  } catch (err) {
    alert('Billing node error: ' + err.message);
    el.manageSubBtn.textContent = originalText;
    el.manageSubBtn.disabled = false;
  }
}

// syncSettingsUI unified above

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
    headers: {
      'Content-Type': 'application/json',
      ...(state.user ? { 'Authorization': `Bearer ${await state.user.getIdToken()}` } : {})
    },
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

  if (!el.pillsRow) el.pillsRow = document.getElementById('pillsRow');
  if (!el.levelsGrid) el.levelsGrid = document.getElementById('levelsGrid');

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
let lastScreenerData = {};

async function initScreener() {
  updateScreener();
  setInterval(updateScreener, 8000); // 8s refresh for 'Institutional' feel
}

async function updateScreener() {
  if (!el.screenerBody) return;

  try {
    const res = await fetch(CONFIG.SCREENER_URL);
    const data = await res.json();

    el.screenerBody.innerHTML = data.map(coin => {
      const price = parseFloat(coin.lastPrice);
      const prevPrice = lastScreenerData[coin.symbol] || price;
      const flashClass = price > prevPrice ? 'price-flash-up' : price < prevPrice ? 'price-flash-down' : '';
      lastScreenerData[coin.symbol] = price;

      const formattedPrice = price.toLocaleString(undefined, { minimumFractionDigits: 2 });
      const change = parseFloat(coin.priceChangePercent);
      const changeClass = change >= 0 ? 'price-up' : 'price-down';
      const indicator = change >= 2 ? 'BUY' : change <= -2 ? 'SELL' : 'NEUTRAL';
      const signalClass = indicator.toLowerCase();

      return `
        <tr class="${flashClass}">
          <td>
            <div class="ticker-name">
              ${coin.symbol.replace('USDT', '')}
              <span class="ticker-symbol">/USDT</span>
            </div>
          </td>
          <td class="font-mono">${formattedPrice}</td>
          <td class="${changeClass} font-mono">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</td>
          <td><span class="signal-badge ${signalClass}">${indicator}</span></td>
          <td class="font-mono text-dim" style="font-size: 11px;">${Math.abs(change) > 4 ? 'HIGH' : 'STABLE'}</td>
        </tr>
      `;
    }).join('');

    // Cleanup flash classes after animation
    setTimeout(() => {
      document.querySelectorAll('.price-flash-up, .price-flash-down').forEach(el => el.classList.remove('price-flash-up', 'price-flash-down'));
    }, 1200);

  } catch (err) {
    console.warn('Screener fetch failed:', err);
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
    const tf = el.verdictTf.textContent || 'Unknown TF';
    const context = el.reasoningBox.textContent;

    const PROMPT = `You are TradeGPT, a senior institutional analyst from ChartSense AI. 
    CURRENT CONTEXT: User analysis for ${ticker} on ${tf}. 
    TECHNICAL SUMMARY: ${context}.
    RISK PROFILE: ${el.riskRow.textContent}.
    USER QUERY: ${msg}.
    
    REPLY PROTOCOL:
    - Maintain a professional, data-driven "Bloomberg Terminal" tone.
    - Provide specific levels (S/R, Liquidity) if available.
    - Be concise. No greetings. High info-density only.`;

    const response = await fetch(CONFIG.BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { temperature: 0.5 }
      })
    });

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Institutional core connection lost.";

    document.getElementById(loadingId).remove();
    await typeMessage(aiResponse);

  } catch (err) {
    document.getElementById(loadingId).textContent = "Institutional Network Latency Detected.";
  }
}

async function typeMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ai`;
  el.chatMessages.appendChild(bubble);

  const words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    bubble.textContent += (i === 0 ? '' : ' ') + words[i];
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    await new Promise(r => setTimeout(r, 40)); // Smooth premium typing
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
  const rrRingFill = document.getElementById('rrRingFill');
  if (!el.rrRatio) return;

  const entry = parseFloat(levels.entry.replace(/[^0-9.]/g, ''));
  const sl = parseFloat(levels.stop_loss.replace(/[^0-9.]/g, ''));
  const tp3 = levels.tp_targets && levels.tp_targets[2] ? parseFloat(levels.tp_targets[2].replace(/[^0-9.]/g, '')) : null;

  if (isNaN(entry) || isNaN(sl) || isNaN(tp3)) {
    el.rrRatio.textContent = '1:--';
    if (rrRingFill) rrRingFill.style.strokeDashoffset = 163.4;
    return;
  }

  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp3 - entry);
  const ratio = (reward / risk).toFixed(2);

  el.rrRatio.textContent = `1:${ratio}`;

  // Fill RR ring (scale 1:0 to 1:5+)
  if (rrRingFill) {
    const score = Math.min(100, (parseFloat(ratio) / 5) * 100);
    const offset = 163.4 - (163.4 * (score / 100));
    rrRingFill.style.strokeDashoffset = offset;
    rrRingFill.style.stroke = ratio >= 2 ? 'var(--green)' : ratio >= 1 ? 'var(--yellow)' : 'var(--red)';
  }
}

function showComingSoon(feature) {
  const modal = document.getElementById('comingSoonModal');
  const title = document.getElementById('csFeatureName');
  if (modal && title) {
    title.textContent = `${feature}`;
    modal.classList.remove('hidden');
  }
}

// ─── V5 HISTORY MODULE ───
async function fetchHistory() {
  if (!state.user || !el.historyList) return;

  el.historyList.innerHTML = '<div class="empty-history">Syncing with encrypted history core...</div>';

  try {
    const token = await state.user.getIdToken();
    const res = await fetch(CONFIG.HISTORY_URL, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();

    renderHistory(data);
  } catch (err) {
    el.historyList.innerHTML = '<div class="empty-history">Failed to load institutional records.</div>';
  }
}

function renderHistory(data) {
  if (!data || data.length === 0) {
    el.historyList.innerHTML = '<div class="empty-history">No institutional records found for this account.</div>';
    return;
  }

  el.historyList.innerHTML = data.map(item => {
    let result = {};
    try {
      result = JSON.parse(item.result);
      result = normalizeAiResponse(result);
    } catch (e) { return ''; }

    const date = new Date(item.timestamp).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const verdictClass = result.verdict.toLowerCase();

    return `
      <div class="history-item" onclick='loadHistoricalAnalysis(${JSON.stringify(result).replace(/'/g, "&apos;")})'>
        <div class="item-header">
          <span class="item-ticker">${result.verdict === 'BUY' ? '▲' : '▼'} ANALYSIS</span>
          <span class="item-date">${date}</span>
        </div>
        <div class="item-ticker" style="font-size: 14px; opacity: 0.9;">PROPRIETARY SIGNAL</div>
        <div class="item-header">
          <span class="item-verdict ${verdictClass}">${result.verdict}</span>
          <span style="font-size: 11px; opacity: 0.5;">${result.confidence_score}% CONF</span>
        </div>
      </div>
    `;
  }).join('');
}

function loadHistoricalAnalysis(data) {
  // Simple "Load" effect
  el.historyPanel.classList.add('hidden');
  renderResults(data, "HISTORICAL", "RECORD");
  el.resultsPanel.scrollIntoView({ behavior: 'smooth' });
}

function copySetupToClipboard() {
  const entry = el.setupEntry.textContent;
  const sl = el.setupSl.textContent;
  const tp1 = el.tp1.textContent;
  const tp2 = el.tp2.textContent;
  const tp3 = el.tp3.textContent;
  const ticker = el.verdictTicker.textContent;

  const text = `📈 CHARTSENSE AI — ELITE SETUP [${ticker}]\n\n` +
    `🔹 ENTRY: ${entry}\n` +
    `🛑 STOP LOSS: ${sl}\n` +
    `🎯 TP 1: ${tp1}\n` +
    `🎯 TP 2: ${tp2}\n` +
    `🎯 TP 3: ${tp3}\n\n` +
    `Institutional Alpha Generated via Gemini 3 Flash.`;

  navigator.clipboard.writeText(text).then(() => {
    el.copySetupBtn.classList.add('copied');
    el.copySetupBtn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => {
      el.copySetupBtn.classList.remove('copied');
      el.copySetupBtn.innerHTML = '<i class="fas fa-copy"></i>';
    }, 2000);
  });
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}
