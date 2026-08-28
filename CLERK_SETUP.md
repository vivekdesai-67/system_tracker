# Clerk Authentication Setup Guide

## ✅ What's Been Done:

1. ✅ Installed Clerk dependencies (`@clerk/clerk-sdk-node`, `@clerk/express`)
2. ✅ Created `clerk.js` - Clerk middleware and user sync
3. ✅ Created `server-clerk.js` - New server with Clerk authentication
4. ✅ Created `sign-in.ejs` - Clerk sign-in page
5. ✅ Created `sign-up.ejs` - Clerk sign-up page

## 🔧 Setup Steps:

### **1. Verify Clerk Dashboard Configuration**

Go to: https://dashboard.clerk.com/

1. **Create an Application** (if you haven't already)
2. **Get Your Keys** from the dashboard:
   - Publishable Key (starts with `pk_test_` or `pk_live_`)
   - Secret Key (starts with `sk_test_` or `sk_live_`)

3. **Configure Authentication Options:**
   - Go to **User & Authentication** → **Email, Phone, Username**
   - Enable: **Email** (required)
   - Enable: **Username** (optional but recommended)
   - Enable: **Phone** (optional)

4. **Set Up Redirect URLs:**
   - Go to **Paths**
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in URL: `/dashboard`
   - After sign-up URL: `/dashboard`

### **2. Update Environment Variables**

Your `.env` file already has Clerk keys:
```
CLERK_PUBLISHABLE_KEY=pk_test_aG9seS1maW5jaC05OTc1LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_f423sNaCfwBSLDCxOvlTfD8Zi1SZF1w91jHkCMT2zt
```

### **3. Test Locally**

Start the Clerk-enabled server:
```bash
node server-clerk.js
```

Open: http://localhost:3000

You should see the Clerk sign-in page!

### **4. Switch to Clerk Server**

To use Clerk authentication instead of the old system:

**Option A: Rename files** (recommended)
```bash
mv server.js server-old.js
mv server-clerk.js server.js
```

**Option B: Update package.json**
Add to package.json:
```json
{
  "scripts": {
    "start": "node server-clerk.js",
    "start:old": "node server.js"
  }
}
```

### **5. Deploy to Vercel**

1. **Add Environment Variables in Vercel:**
   - Go to your Vercel project
   - Settings → Environment Variables
   - Add:
     - `CLERK_PUBLISHABLE_KEY`
     - `CLERK_SECRET_KEY`
     - `DATABASE_URL`
     - `DISCORD_WEBHOOK_URL`

2. **Update vercel.json** (if using Option A above):
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ]
   }
   ```

3. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Add Clerk authentication"
   git push origin main
   ```

## 🎯 How It Works:

### **User Flow:**

1. **First Time User:**
   - Visits `/sign-in` or `/sign-up`
   - Creates account via Clerk (email/username/password)
   - Clerk handles verification
   - User is redirected to `/dashboard`
   - `syncClerkUser` middleware creates user in your database with `clerk_id`

2. **Returning User:**
   - Signs in via Clerk
   - `syncClerkUser` finds user by `clerk_id`
   - User accesses dashboard

3. **Admin Users:**
   - You can manually update a user's role in the database:
     ```sql
     UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
     ```

### **Features:**

✅ **Social Login** - Enable Google, GitHub, etc. in Clerk dashboard  
✅ **2FA** - Clerk handles MFA out of the box  
✅ **Email Verification** - Automatic  
✅ **Password Reset** - Handled by Clerk  
✅ **Session Management** - Clerk manages sessions  
✅ **Fast Performance** - No bcrypt delays!  

## 📊 Benefits Over Custom Auth:

| Feature | Custom Auth | Clerk Auth |
|---------|-------------|------------|
| **Login Speed** | 500ms-2s (bcrypt) | 100-300ms |
| **Security** | Manual updates | Auto-updated |
| **Password Reset** | Build yourself | Built-in |
| **2FA** | Build yourself | Built-in |
| **Social Login** | Complex setup | 1-click enable |
| **Email Verification** | Build yourself | Built-in |
| **Session Management** | Manual JWT | Managed |

## 🔐 Security:

- Clerk uses secure session tokens
- Automatic CSRF protection
- Rate limiting built-in
- Compromise detection
- Anomaly detection

## 🐛 Troubleshooting:

### **"Clerk is not defined"**
- Make sure the Clerk script is loaded before mounting components
- Check your `CLERK_PUBLISHABLE_KEY` is correct

### **"User not syncing to database"**
- Check `syncClerkUser` middleware is applied to routes
- Check database `clerk_id` column exists
- Check Vercel logs for errors

### **"Redirect loop"**
- Make sure `/sign-in` doesn't require auth
- Check `afterSignInUrl` and `afterSignUpUrl` are set correctly

## 📚 Next Steps:

1. **Customize Appearance**: Go to Clerk Dashboard → Customization → Theme
2. **Add Social Logins**: Go to Clerk Dashboard → User & Authentication → Social Connections
3. **Enable 2FA**: Go to Clerk Dashboard → User & Authentication → Multi-factor
4. **Webhooks**: Set up Clerk webhooks for advanced user management

## 🚀 Ready to Launch:

Once you've tested locally and everything works:
1. Rename `server-clerk.js` to `server.js`
2. Push to GitHub
3. Vercel will auto-deploy
4. Your app now uses Clerk authentication! 🎉
