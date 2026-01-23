# 🚀 Quick Deploy Guide - BizGrow AI

## ⚡ 1-Minute Deployment

### Option 1: Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway variables set GEMINI_API_KEY=your_api_key_here
railway variables set NODE_ENV=production
railway up
```

### Option 2: Automated Deployment Script
```bash
# Run the interactive deployment script
npm run deploy
```

### Option 3: Docker (Local/VPS)
```bash
# Make sure Docker is installed
docker --version

# Deploy with Docker Compose
npm run deploy:docker
```

## 🔑 Required Environment Variables

Set these in your deployment platform:

```env
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=production
PORT=3001
```

Optional (for email features):
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

## 🌐 Platform-Specific URLs

After deployment, your app will be available at:

- **Railway**: `https://your-app-name.railway.app`
- **Render**: `https://your-app-name.onrender.com`
- **Vercel**: `https://your-app-name.vercel.app`
- **Docker**: `http://localhost:3001`

## 📊 Health Check

Test your deployment:
- Health: `https://your-app.com/health`
- API: `https://your-app.com/api/health`
- Dashboard: `https://your-app.com/api/developer/metrics`

## 🆘 Troubleshooting

### Common Issues:
1. **Build fails**: Check Node.js version (need 18+)
2. **API errors**: Verify GEMINI_API_KEY is set correctly
3. **CORS issues**: Check allowed origins in server/index.js
4. **Database errors**: Ensure write permissions for SQLite

### Debug Commands:
```bash
# Check Railway logs
railway logs

# Check local Docker logs
docker-compose logs -f

# Test API locally
curl http://localhost:3001/health
```

## 💰 Free Tier Limits

- **Railway**: 500 hours/month (≈20 days)
- **Render**: 750 hours/month (≈31 days)  
- **Vercel**: Unlimited for hobby projects

Choose Railway for the best free Node.js hosting experience!