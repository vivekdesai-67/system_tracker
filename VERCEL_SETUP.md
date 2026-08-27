# Vercel Deployment Setup for SystemCall

## ⚠️ Important: Environment Variables

Your login issue is likely because **environment variables are not set in Vercel**. The app needs these to work:

### Required Environment Variables in Vercel:

1. Go to your Vercel project dashboard
2. Click on **Settings** → **Environment Variables**
3. Add these variables:

```
DATABASE_URL=postgresql://neondb_owner:npg_zjMSF6QVOwq5@ep-orange-butterfly-azd51yx1-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

JWT_SECRET=systemcall_super_secret_jwt_key_2026

DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1542410900063911979/ql3S60QMGXkH_jBI7Cihi4DIIrAxi4QiWlY4o3YtkJxWoPMYgnYAUlWboXsy-1XULskK

GMAIL_USER=suryaben10000@gmail.com
GMAIL_APP_PASSWORD=rxjxgdujzimjdovg
```

4. **Important**: Set these for **Production, Preview, and Development** environments
5. After adding variables, **redeploy** your project

## 🔑 Login Credentials

After deployment, use these credentials to login:

- **Username**: `admin`
- **Password**: `Password@123`

Other users:
- Seniors: `tamil`, `arun`, `pavan`, `mani`, `lakshman`
- Juniors: `vivek`, `manikhandan`, `harikrishna`, `adharsh`, `santosh`, `chandan`, `kushal`, `sreya`

All use the same password: `Password@123`

## 🚀 Redeploy to Vercel

After setting environment variables:

```bash
# Commit the latest changes
git add .
git commit -m "Fix Vercel deployment and login issues"
git push

# Or manually redeploy in Vercel dashboard
```

## ⚠️ Known Limitations on Vercel

1. **Socket.io real-time updates won't work** - Vercel is serverless and doesn't support WebSockets
   - Dashboard will still work, but you'll need to refresh the page to see new issues
   - Consider using polling or moving to a different host for real-time features

2. **Cold starts** - First request might be slow as the serverless function wakes up

## 🐛 Troubleshooting

### Login still not working?

1. **Check Vercel logs**: Go to Vercel Dashboard → Deployments → [Latest] → Function Logs
2. **Clear browser cookies**: The old session might be cached
3. **Check environment variables**: Make sure all required variables are set
4. **Verify database access**: Ensure Neon database allows connections from Vercel's IPs

### Common errors:

- "Invalid username or password" - Environment variables not set correctly
- "Server error" - Database connection issue or JWT_SECRET missing
- Infinite redirect - Token not being set/verified correctly (check JWT_SECRET)

## 📝 Alternative: Deploy to Railway/Render

If you need Socket.io (real-time features), consider deploying to:
- **Railway** (supports WebSockets)
- **Render** (supports WebSockets)
- **Heroku** (supports WebSockets)

These platforms support persistent connections needed for Socket.io.
