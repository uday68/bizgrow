@echo off
echo ========================================
echo AI Chat Enhancement - Deployment Verification
echo ========================================
echo.

set BASE_URL=https://biggrow-production.up.railway.app

echo [1/5] Testing Health Endpoint...
curl -s %BASE_URL%/api/health
echo.
echo.

echo [2/5] Testing Service Catalog...
curl -s %BASE_URL%/api/chat/services/catalog
echo.
echo.

echo [3/5] Testing Chat Session Creation...
curl -s -X POST %BASE_URL%/api/chat/sessions -H "Content-Type: application/json" -d "{\"customerInfo\":{\"name\":\"Test Customer\",\"email\":\"test@example.com\"}}"
echo.
echo.

echo [4/5] Testing Quotation Generation...
curl -s -X POST %BASE_URL%/api/chat/quotations/generate -H "Content-Type: application/json" -d "{\"businessId\":\"test-business\",\"customerId\":\"test-customer\",\"services\":[\"website\",\"digital-marketing\"]}"
echo.
echo.

echo [5/5] Testing Memory Statistics (requires auth - will fail)...
curl -s %BASE_URL%/api/chat/memory/statistics
echo.
echo.

echo ========================================
echo Verification Complete!
echo ========================================
echo.
echo If you see errors above, the deployment may not be complete yet.
echo Wait 2-3 minutes and run this script again.
echo.
pause
