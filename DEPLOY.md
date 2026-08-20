# 🏏 Cricket Duel — Deploy to Internet

Your game has 2 parts:
- **Client** (React) → served as static files
- **Server** (Node.js + Socket.io) → handles multiplayer

Both run on the **same server** in production. You only need **one deploy**.

---

## Step 1: Push to GitHub

1. Create a GitHub account at https://github.com (if you don't have one)
2. Install GitHub Desktop: https://desktop.github.com
3. Open GitHub Desktop → File → Add Local Repository → select your `cricket-duel` folder
4. Click "Publish repository" → make it **Public** (free tier)
5. Note the URL: `https://github.com/YOUR_USERNAME/cricket-duel`

---

## Step 2: Deploy to Railway

1. Go to https://railway.app
2. Click **"Start a New Project"** → **"Deploy from GitHub repo"**
3. Sign in with your GitHub account
4. Select your `cricket-duel` repository
5. Railway will auto-detect Node.js and start building
6. Wait for the build to finish (~2-3 minutes)
7. Click **"Settings"** → **"Networking"** → **"Generate Domain"**
8. You'll get a URL like `cricket-duel.up.railway.app`
9. **Open that URL on your phone and PC — anyone in the world can play!**

---

## Step 3: Share with friends

Just share your Railway URL. No app install needed — works in any browser.

---

## How it works

- Railway runs `npm install` → `npm run build` (builds the React client) → `npm start` (runs the server)
- The server serves the built client files AND handles Socket.io connections
- Both players connect to the same server URL
- No database needed — games are stored in memory

---

## Troubleshooting

**Build fails?**
- Check the Railway build logs
- Make sure all dependencies are in `package.json`

**Can't connect?**
- Railway free tier may take 30-60 seconds to wake up after idle
- Try refreshing the page

**Want a custom domain?**
- Railway Settings → Networking → Custom Domain
- Or use Cloudflare Pages for the client + Railway for the server
