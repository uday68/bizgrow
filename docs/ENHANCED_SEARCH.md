# Enhanced Search & Maps Integration

## Overview

The Enhanced Search system provides advanced business discovery capabilities with interactive maps, comprehensive filtering, web presence detection, and social media scanning. This system combines Google Gemini AI, Google Maps API, and custom web presence analysis to deliver powerful lead generation tools.

## Features

### 1. Interactive Map Visualization

**Embedded Google Maps**
- Real-time map display of search results
- Custom markers indicating business status:
  - 🟢 Green: Has website
  - 🔴 Red: No website (high opportunity)
- Click markers to view business details
- Automatic bounds fitting to show all results
- Smooth zoom and pan controls

**Map Clustering**
- Businesses are grouped when zoomed out
- Clusters expand when zoomed in
- Performance optimized for 100+ markers

### 2. Advanced Search Filters

**Rating Filter**
- Any Rating
- 3+ Stars
- 4+ Stars
- 4.5+ Stars

**Distance Filter**
- Adjustable radius (1-50 km)
- Calculated from user's current location
- Real-time distance display on business cards

**Business Type Filter**
- All Types
- Restaurants
- Retail Stores
- Cafes
- Gyms
- Salons
- Custom types

**Website Status Filter**
- Any
- No Website (high opportunity leads)
- Has Website

**Operating Hours Filter**
- Any
- Open Now
- Open 24/7

### 3. Web Presence Detection

**Website Analysis**
- Accessibility check (is site reachable?)
- SSL/HTTPS verification
- Load time measurement
- Mobile responsiveness detection
- Contact form detection
- Online booking system detection

**Digital Presence Score (0-100)**
- Website: 40 points
  - Exists: 20 points
  - Accessible: 10 points
  - Has SSL: 5 points
  - Fast load time (<3s): 5 points
- Social Media: 30 points
  - 6 points per active platform
- Online Listings: 30 points
  - 5 points per claimed listing

### 4. Social Media Scanning

**Supported Platforms**
- Facebook
- Instagram
- Twitter/X
- LinkedIn
- YouTube
- TikTok
- Yelp

**Profile Information**
- Profile URL
- Verification status
- Follower count
- Last post date
- Activity status (active/inactive)

### 5. Online Listings Detection

**Tracked Listing Sites**
- Google My Business (High Priority)
- Yelp (High Priority)
- Yellow Pages (Medium Priority)
- Better Business Bureau (Medium Priority)
- Foursquare (Low Priority)
- TripAdvisor (Medium Priority)

**Listing Analysis**
- Claimed status
- Rating and review count
- Profile completeness
- Consistency across platforms

### 6. Automated Recommendations

**Priority Levels**
- 🔴 Critical: Immediate action required
- 🟠 High: Important for growth
- 🟡 Medium: Beneficial improvements
- 🟢 Low: Nice-to-have enhancements

**Recommendation Categories**
- Website creation/fixes
- Security improvements (SSL)
- Social media establishment
- Social media reactivation
- Business listing claims
- Listing expansion

**Each Recommendation Includes**
- Priority level
- Category
- Title and description
- Estimated impact (high/medium/low)
- Estimated cost
- Implementation timeframe

## API Endpoints

### Scan Business Web Presence

```http
POST /api/enhanced-search/scan-presence
Content-Type: application/json

{
  "businessData": {
    "name": "Joe's Pizza",
    "address": "123 Main St, New York, NY",
    "website": "https://joespizza.com",
    "phone": "+1-555-0123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "businessName": "Joe's Pizza",
    "website": {
      "exists": true,
      "accessible": true,
      "hasSSL": true,
      "loadTime": 1250,
      "statusCode": 200
    },
    "socialMedia": [
      {
        "platform": "facebook",
        "url": "https://facebook.com/joespizza",
        "verified": true,
        "followers": 5420,
        "lastPost": "2024-01-20T10:30:00Z",
        "active": true
      }
    ],
    "onlineListings": [
      {
        "site": "Google My Business",
        "url": "https://google.com/maps",
        "priority": "high",
        "claimed": true,
        "rating": "4.5",
        "reviewCount": 342,
        "complete": true
      }
    ],
    "digitalPresenceScore": 85,
    "recommendations": [
      {
        "priority": "medium",
        "category": "social_media",
        "title": "Expand Social Media Presence",
        "description": "Consider adding Instagram and Twitter",
        "estimatedImpact": "medium",
        "estimatedCost": "$0",
        "timeframe": "2 weeks"
      }
    ]
  }
}
```

### Batch Scan Multiple Businesses

```http
POST /api/enhanced-search/batch-scan
Content-Type: application/json

{
  "businesses": [
    {
      "name": "Business 1",
      "address": "Address 1",
      "website": "https://example1.com"
    },
    {
      "name": "Business 2",
      "address": "Address 2"
    }
  ]
}
```

### Filter Businesses

```http
POST /api/enhanced-search/filter
Content-Type: application/json

{
  "filters": {
    "minRating": 4.0,
    "maxDistance": 10,
    "businessType": "restaurant",
    "hasWebsite": false
  },
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060
  }
}
```

### Get Enhanced Business Details

```http
GET /api/enhanced-search/business/:id
```

### Get Analytics

```http
GET /api/enhanced-search/analytics
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "total": 1250,
      "no_website": 450,
      "high_rated": 680,
      "avg_rating": 4.2,
      "avg_digital_score": 62.5,
      "avg_opportunity_score": 75.3
    },
    "topIndustries": [
      { "industry": "Restaurant", "count": 320 },
      { "industry": "Retail", "count": 280 }
    ],
    "topRegions": [
      { "region": "New York", "count": 450 },
      { "region": "Los Angeles", "count": 380 }
    ]
  }
}
```

## Frontend Components

### EnhancedLeadSearch Component

**Props:**
- `onSaveLead`: Function to save a lead
- `savedLeadIds`: Array of saved lead IDs

**Features:**
- Search bar with location detection
- View mode toggle (List/Map)
- Filter panel
- Business cards with photos
- Distance calculation
- Real-time map updates

**Usage:**
```tsx
import EnhancedLeadSearch from './components/EnhancedLeadSearch';

<EnhancedLeadSearch
  onSaveLead={(lead) => handleSaveLead(lead)}
  savedLeadIds={savedLeads.map(l => l.id)}
/>
```

### GoogleMapsService

**Methods:**
- `findNearbyBusinesses(location, radius, type, keyword)`
- `getPlaceDetails(placeId)`
- `geocodeAddress(address)`
- `getPhotoUrl(photoReference, maxWidth)`
- `checkWebsiteStatus(url)`
- `calculateDistance(point1, point2)`

**Usage:**
```typescript
import { googleMapsService } from '../services/googleMapsService';

// Find nearby businesses
const places = await googleMapsService.findNearbyBusinesses(
  { lat: 40.7128, lng: -74.0060 },
  5000,
  'restaurant',
  'pizza'
);

// Get place details
const details = await googleMapsService.getPlaceDetails('ChIJN1t_tDeuEmsRUsoyG83frY4');

// Calculate distance
const distance = googleMapsService.calculateDistance(
  { lat: 40.7128, lng: -74.0060 },
  { lat: 40.7589, lng: -73.9851 }
);
```

## Setup Instructions

### 1. Get Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable these APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
4. Create credentials (API Key)
5. Restrict the API key:
   - HTTP referrers: Your domain
   - API restrictions: Select the 3 APIs above

### 2. Configure Environment Variables

Add to `.env`:
```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
```

### 3. Update index.html

The Google Maps script is already included:
```html
<script async defer src="https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=places"></script>
```

Replace `YOUR_KEY` with your actual API key or use environment variable injection.

### 4. Install Dependencies

No additional npm packages required - uses native Google Maps JavaScript API.

## Performance Optimization

### Caching Strategy

**Google Maps Service**
- 24-hour cache for place details
- In-memory Map cache
- Automatic cache cleanup

**Web Presence Scanner**
- Rate limiting: 1 request per second
- Batch processing with progress callbacks
- Async scanning to prevent blocking

### Rate Limiting

**Google Maps API**
- Free tier: 28,000 requests/month
- Paid tier: $7 per 1,000 requests
- Implement request queuing for high volume

**Recommendations:**
- Cache aggressively
- Batch requests when possible
- Use Places API only when needed
- Implement user-based rate limiting

## Best Practices

### 1. Error Handling

```typescript
try {
  const places = await googleMapsService.findNearbyBusinesses(location, radius);
} catch (error) {
  if (error.message.includes('OVER_QUERY_LIMIT')) {
    // Handle rate limit
    showNotification('Too many requests. Please try again later.');
  } else if (error.message.includes('INVALID_REQUEST')) {
    // Handle invalid parameters
    showNotification('Invalid search parameters.');
  } else {
    // Generic error
    showNotification('Search failed. Please try again.');
  }
}
```

### 2. User Experience

- Show loading states during searches
- Display distance in user's preferred units
- Provide clear filter feedback
- Show map loading indicators
- Handle geolocation permission denials gracefully

### 3. Security

- Never expose API keys in client code
- Use environment variables
- Implement API key restrictions
- Add rate limiting on backend
- Validate all user inputs

### 4. Accessibility

- Keyboard navigation for filters
- Screen reader support for map markers
- Alt text for business photos
- ARIA labels for interactive elements
- Focus management in modals

## Troubleshooting

### Map Not Loading

**Check:**
1. API key is correct in `.env`
2. Maps JavaScript API is enabled
3. Browser console for errors
4. Network tab for failed requests

**Common Issues:**
- API key restrictions too strict
- Billing not enabled on Google Cloud
- CORS issues (use backend proxy)

### No Search Results

**Check:**
1. Location permissions granted
2. Search radius not too small
3. Filters not too restrictive
4. API quotas not exceeded

### Slow Performance

**Solutions:**
- Implement result pagination
- Reduce map marker count
- Use marker clustering
- Optimize image sizes
- Enable caching

## Future Enhancements

### Planned Features

1. **Street View Integration**
   - Embed street view in business cards
   - Virtual business tours

2. **Advanced Analytics**
   - Competitor analysis
   - Market saturation metrics
   - Growth opportunity scoring

3. **AI-Powered Insights**
   - Automated business categorization
   - Sentiment analysis from reviews
   - Predictive lead scoring

4. **Export Capabilities**
   - CSV export of filtered results
   - PDF reports with maps
   - CRM integration

5. **Collaboration Features**
   - Team lead sharing
   - Assignment workflows
   - Activity tracking

## Support

For issues or questions:
- Check the [main documentation](./README.md)
- Review [Google Maps API docs](https://developers.google.com/maps/documentation)
- Contact support team

## License

This enhanced search system is part of BizGrow AI and follows the same license terms.
