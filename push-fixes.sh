#!/bin/bash

echo "🚀 Pushing Railway deployment fixes..."
echo

echo "Adding files to git..."
git add .

echo
echo "Committing changes..."
git commit -m "Fix Railway deployment: Update Dockerfile CMD and railway.json config"

echo
echo "Pushing to GitHub..."
git push origin main

echo
echo "✅ Deployment fixes pushed!"
echo
echo "Next steps:"
echo "1. Check Railway dashboard for automatic deployment"
echo "2. Monitor build logs for any issues"
echo "3. Test health endpoints once deployed"
echo "4. Run: node verify-deployment.js --production"