# BizGrow AI - Free Deployment Guide

## 🚀 Free Hosting Options

### Recommended Free Platforms
1. **Railway** - Best for Node.js apps (500 hours/month free)
2. **Render** - Great for full-stack apps (750 hours/month free)
3. **Vercel** - Excellent for frontend + serverless functions
4. **Netlify** - Good for static sites + serverless functions
5. **Heroku** - Classic platform (limited free tier)

## 🛤️ Railway Deployment (Recommended)

### Why Railway?
- ✅ 500 execution hours/month free
- ✅ Automatic deployments from GitHub
- ✅ Built-in database support
- ✅ Environment variable management
- ✅ Custom domains
- ✅ WebSocket support

### Step-by-Step Railway Deployment

#### 1. Prepare for Deployment
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login
```

#### 2. Initialize Railway Project
```bash
# In your project root
railway init

# Link to existing project or create new
railway link
```

#### 3. Set Environment Variables
```bash
# Set your API keys
railway variables set GEMINI_API_KEY=your_gemini_api_key_here
railway variables set PORT=3001
railway variables set NODE_ENV=production

# Optional email settings
railway variables set EMAIL_HOST=smtp.gmail.com
railway variables set EMAIL_PORT=587
railway variables set EMAIL_USER=your_email@gmail.com
railway variables set EMAIL_PASS=your_app_password
```

#### 4. Deploy
```bash
# Deploy the application
railway up

# Or deploy from GitHub (recommended)
# Connect your GitHub repo in Railway dashboard
```

## 🎨 Render Deployment

### Step-by-Step Render Deployment

#### 1. Create render.yaml
```yaml
# render.yaml
services:
  - type: web
    name: bizgrow-ai-server
    env: node
    plan: free
    buildCommand: cd server && npm install
    startCommand: cd server && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: GEMINI_API_KEY
        sync: false
      - key: EMAIL_HOST
        value: smtp.gmail.com
      - key: EMAIL_PORT
        value: 587
      - key: EMAIL_USER
        sync: false
      - key: EMAIL_PASS
        sync: false

  - type: web
    name: bizgrow-ai-frontend
    env: static
    plan: free
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    envVars:
      - key: VITE_API_URL
        value: https://bizgrow-ai-server.onrender.com
```

#### 2. Connect GitHub Repository
1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. Connect your repository
4. Render will auto-deploy using render.yaml

## ⚡ Vercel Deployment (Frontend + Serverless)

### Step-by-Step Vercel Deployment

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Create vercel.json
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/static-build",
      "config": {
        "distDir": "dist"
      }
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "/api/$1"
    },
    {
      "src": "/(.*)",
      "dest": "/index.html"
    }
  ],
  "functions": {
    "api/**.js": {
      "runtime": "nodejs18.x"
    }
  },
  "env": {
    "GEMINI_API_KEY": "@gemini-api-key",
    "NODE_ENV": "production"
  }
}
```

#### 3. Deploy
```bash
# Deploy to Vercel
vercel

# Set environment variables
vercel env add GEMINI_API_KEY
```

## 🌐 Netlify Deployment

### Step-by-Step Netlify Deployment

#### 1. Create netlify.toml
```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[headers]]
  for = "/api/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "GET, POST, PUT, DELETE, OPTIONS"
    Access-Control-Allow-Headers = "Content-Type, Authorization"
```

#### 2. Deploy
1. Go to [netlify.com](https://netlify.com)
2. Connect GitHub repository
3. Set build command: `npm run build`
4. Set publish directory: `dist`
5. Add environment variables in Netlify dashboard

## 🐳 Docker Deployment (Any Platform)

### Create Dockerfile
```dockerfile
# Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install dependencies
RUN npm install
RUN cd server && npm install

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Expose port
EXPOSE 3001

# Start server
CMD ["npm", "run", "server:start"]
```

### Create docker-compose.yml
```yaml
version: '3.8'
services:
  bizgrow-ai:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - ./server/database:/app/server/database
    restart: unless-stopped
```

## 📋 Pre-Deployment Checklist

### ✅ Code Preparation
- [ ] All environment variables configured
- [ ] Database initialization scripts ready
- [ ] Error handling implemented
- [ ] CORS configured for production
- [ ] API rate limiting enabled
- [ ] Logging configured

### ✅ Security Checklist
- [ ] API keys stored as environment variables
- [ ] No sensitive data in code
- [ ] Input validation implemented
- [ ] HTTPS enforced
- [ ] CORS properly configured

### ✅ Performance Optimization
- [ ] Frontend assets minified
- [ ] Database queries optimized
- [ ] Caching implemented
- [ ] Compression enabled
- [ ] CDN configured (if needed)

## 🔧 Production Configuration Updates

### Update API Service URLs
```typescript
// services/apiService.ts - Update for production
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-app-name.railway.app/api'  // Replace with your Railway URL
  : 'http://localhost:3001/api';
```

### Update WebSocket Service
```typescript
// services/websocketService.ts - Update for production
const getWebSocketUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'wss://your-app-name.railway.app';  // Replace with your Railway URL
  }
  return 'ws://localhost:3001';
};
```

### Update CORS Configuration
```javascript
// server/index.js - Update CORS for production
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com', 'https://your-app-name.railway.app']
    : ['http://localhost:3000'],
  credentials: true
}));
```

## 🚀 Quick Deploy Commands

### Railway (Recommended)
```bash
# One-time setup
npm install -g @railway/cli
railway login
railway init

# Set environment variables
railway variables set GEMINI_API_KEY=your_key_here
railway variables set NODE_ENV=production

# Deploy
railway up
```

### Render
```bash
# Just push to GitHub after adding render.yaml
git add .
git commit -m "Add Render deployment config"
git push origin main
```

### Vercel
```bash
# One-time setup
npm install -g vercel
vercel login

# Deploy
vercel
vercel env add GEMINI_API_KEY
```

## 📊 Post-Deployment Monitoring

### Health Check Endpoints
```javascript
// Add to server/index.js
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: 'connected',
    agents: {
      discovery: discoveryAgent.getStatus(),
      proposal: proposalAgent.getStatus(),
      builder: builderAgent.getStatus()
    }
  });
});
```

### Monitoring URLs
After deployment, monitor these endpoints:
- `https://your-app.railway.app/health` - Basic health check
- `https://your-app.railway.app/api/health` - Detailed system status
- `https://your-app.railway.app/api/developer/metrics` - Dashboard metrics

## 🆘 Troubleshooting

### Common Issues
1. **Build Failures**: Check Node.js version compatibility
2. **Environment Variables**: Ensure all required vars are set
3. **Database Issues**: Check file permissions and paths
4. **CORS Errors**: Update allowed origins for production
5. **WebSocket Issues**: Ensure WSS is used for HTTPS sites

### Debug Commands
```bash
# Check Railway logs
railway logs

# Check Render logs
# Available in Render dashboard

# Local testing with production config
NODE_ENV=production npm run server
```

## 💰 Cost Optimization

### Free Tier Limits
- **Railway**: 500 hours/month (≈20 days continuous)
- **Render**: 750 hours/month (≈31 days continuous)
- **Vercel**: Unlimited for hobby projects
- **Netlify**: 300 build minutes/month

### Optimization Tips
1. **Sleep Mode**: Use Railway/Render sleep mode for development
2. **Efficient Queries**: Optimize database queries to reduce CPU usage
3. **Caching**: Implement aggressive caching to reduce API calls
4. **Compression**: Enable gzip compression to reduce bandwidth
5. **CDN**: Use free CDN services for static assets

Choose Railway for the best free Node.js hosting experience with your BizGrow AI MVP!