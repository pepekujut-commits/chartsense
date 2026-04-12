# 🚀 ChartSense AI ELITE — SaaS Launch Guide

This guide will walk you through setting up your professional SaaS infrastructure so you can start accepting institutional logins and real payments.

## 1. Firebase Setup (Authentication & Database)
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project called "ChartSense AI".
3. **Authentication**: Enable "Email/Password" and "Google" in the Auth tab.
4. **Firestore**: Create a Database in "Production Mode".
5. **Project Settings**:
   - Scroll down to "Your Apps" and add a "Web App".
   - Copy the `firebaseConfig` object and paste it into `public/elite-v4.js`.
6. **Service Account**:
   - Go to "Project Settings" -> "Service Accounts".
   - Click "Generate New Private Key".
   - Open the JSON file, copy everything, and paste it into your `.env` as `FIREBASE_SERVICE_ACCOUNT`.

## 2. Stripe Setup (Payments)
1. Sign up/Log in to [Stripe](https://dashboard.stripe.com/).
2. Enable **Test Mode** (toggle in the top right).
3. **Product Catalog**:
   - Create a product called "ChartSense Elite Pro".
   - Set the price to $29.00 / month.
   - Copy the **Price ID** (starts with `price_...`) and paste it into `public/elite-v4.js` inside the `handlePayment` function.
4. **API Keys**:
   - Copy your `Secret Key` (sk_test_...) into `.env` as `STRIPE_SECRET_KEY`.
5. **Webhooks**:
   - Go to "Developers" -> "Webhooks".
   - Add an endpoint: `https://your-vercel-domain.com/api/webhook`.
   - Select event: `checkout.session.completed`.
   - Copy the "Signing Secret" (whsec_...) into `.env` as `STRIPE_WEBHOOK_SECRET`.

## 3. Vercel Deployment
1. Install Vercel CLI: `npm install -g vercel`.
2. Link your project: `npx vercel link`.
3. **Critical**: Go to your Vercel Dashboard -> Project Settings -> **Environment Variables**.
4. Add ALL variables from your `.env` file there.
5. Deploy: `npx vercel --prod`.

## 4. Final Testing
1. Open your live URL.
2. Sign in with a test email.
3. Click "Upgrade" -> Complete the Stripe test payment (use card `4242 4242...`).
4. Once redirected back, verify that your credits show `∞` and the badge says "✨ Pro Active".

> [!SUCCESS]
> **Congratulations!** Your institutional-grade trading platform is now a live revenue-generating SaaS.
