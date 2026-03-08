# IIM Shillong Elective Portal — Deployment Guide

This guide walks you from zero to a live portal handling 400–500 simultaneous users.

---

## PART 1: Firebase Setup (10 minutes)

### 1.1 Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click **"Add project"** → Name it `iimshillong-elective`
3. Disable Google Analytics (optional) → **Create project**

### 1.2 Enable Authentication
1. Left sidebar → **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, enable **Anonymous** → Save
   - Anonymous auth lets students register/login without password management

### 1.3 Create Realtime Database
1. Left sidebar → **Build → Realtime Database**
2. Click **"Create Database"**
3. Choose location: **asia-south1 (Mumbai)** — closest to IIM Shillong
4. Start in **locked mode** → Enable
5. Go to **Rules** tab, paste this and Publish:

```json
{
  "rules": {
    "students": {
      "$roll": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "bids": {
      "$courseId": {
        ".read": "auth != null",
        "$roll": {
          ".write": "auth != null"
        }
      }
    },
    "reviews": {
      ".read": "auth != null",
      "$key": {
        ".write": "auth != null"
      }
    },
    "activity": {
      ".read": "auth != null",
      ".write": "auth != null"
    },
    "presence": {
      ".read": "auth != null",
      "$roll": {
        ".write": "auth != null"
      }
    }
  }
}
```

### 1.4 Get Firebase Config
1. Go to **Project Settings** (gear icon) → **General**
2. Scroll to **Your apps** → Click **</>** (Web)
3. Register app as `elective-portal` → Continue
4. **Copy** the `firebaseConfig` object — you'll need it

---

## PART 2: Local Development Setup (5 minutes)

### 2.1 Prerequisites
- Node.js 18+ (https://nodejs.org)
- npm 9+

### 2.2 Install Dependencies
```bash
cd elective-portal
npm install
```

### 2.3 Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your Firebase values:
```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=iimshillong-elective.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://iimshillong-elective-default-rtdb.asia-south1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=iimshillong-elective
VITE_FIREBASE_STORAGE_BUCKET=iimshillong-elective.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=1:xxx:web:xxx
```

### 2.4 Run Locally
```bash
npm run dev
```
Visit http://localhost:5173

---

## PART 3: Deploy to Vercel (5 minutes) — Recommended

Vercel is free, fast, and handles 400–500 users with zero config.

### 3.1 Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_ORG/elective-portal.git
git push -u origin main
```

### 3.2 Deploy on Vercel
1. Go to https://vercel.com → Sign up with GitHub
2. Click **"New Project"** → Import your GitHub repo
3. Framework: **Vite** (auto-detected)
4. **Environment Variables** — Add each from your `.env`:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Click **Deploy** → Done in ~2 minutes

You'll get a URL like: `https://elective-portal-iim.vercel.app`

### 3.3 Add Authorized Domain to Firebase
1. Firebase Console → Authentication → Settings → **Authorized domains**
2. Add your Vercel domain: `elective-portal-iim.vercel.app`

---

## PART 4: Firebase Hosting Alternative (if you want iimshillong.ac.in subdomain)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
# Select your project, set public dir to "dist", SPA: yes
npm run build
firebase deploy
```

---

## PART 5: Capacity Planning (400–500 users)

### Firebase Spark (Free) Plan Limits
| Resource | Limit | Your usage at 500 users |
|---|---|---|
| Simultaneous connections | **100,000** | ~500 ✅ |
| Database storage | 1 GB | ~50 MB ✅ |
| Database download/month | 10 GB | ~2 GB ✅ |
| Authentication | Unlimited | ✅ |

**The free plan is MORE than enough for 500 students.**

### Realtime Database Performance
Firebase Realtime Database uses WebSocket connections (not HTTP polling). Each connected student uses 1 persistent connection. Firebase supports 100,000 simultaneous connections on free plan — you need ~500.

### Why This Scales
- **CDN delivery**: Vercel serves static files from global CDN — page loads in <1s anywhere in India
- **Firebase WebSockets**: All bid updates are pushed to clients in real-time, not polled
- **Optimistic UI**: Bids update locally first, then sync — feels instant
- **Minimal reads**: Each client subscribes to data paths, Firebase only sends diffs

---

## PART 6: Managing the Auction

### Start/Stop Bidding
You can add an `auctionOpen` flag to Firebase to control when bidding is active:

In Firebase Console → Realtime Database, add:
```json
{
  "auctionConfig": {
    "open": true,
    "startTime": 1720000000000,
    "endTime": 1720014400000
  }
}
```

### Export All Bids (Admin)
In Firebase Console → Realtime Database → `bids` node → ⋮ → **Export JSON**

### Monitor Usage
Firebase Console → **Usage** tab shows real-time connections, reads/writes.

---

## PART 7: Custom Domain (Optional)

On Vercel:
1. Project Settings → Domains → Add `bidding.iimshillong.ac.in`
2. Contact IIM IT dept to add CNAME: `bidding → cname.vercel-dns.com`

---

## PART 8: Troubleshooting

| Issue | Fix |
|---|---|
| "Permission denied" | Check Firebase Rules — ensure auth != null checks pass |
| Blank page after deploy | Check env vars are set in Vercel dashboard |
| Slow on mobile | Enable Firebase offline persistence (add `enableIndexedDbPersistence(db)`) |
| "Network error" | Add Vercel domain to Firebase Authorized Domains |
| Students can't register | Check roll format `20xxPGPxxx` in validation regex |

---

## Summary Checklist

- [ ] Firebase project created (asia-south1)
- [ ] Anonymous Authentication enabled
- [ ] Realtime Database created with security rules
- [ ] `.env` file configured with Firebase keys
- [ ] `npm install && npm run dev` works locally
- [ ] Pushed to GitHub
- [ ] Deployed on Vercel with env vars set
- [ ] Vercel domain added to Firebase Authorized Domains
- [ ] Tested registration + login + bid placement
- [ ] Shared portal URL with batch coordinator
