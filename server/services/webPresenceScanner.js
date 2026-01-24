import logger from './logger.js';

/**
 * Web Presence Scanner Service
 * Detects and analyzes online presence of businesses
 */
class WebPresenceScanner {
  constructor() {
    this.socialMediaPlatforms = [
      { name: 'facebook', patterns: ['facebook.com/', 'fb.com/'], icon: 'facebook' },
      { name: 'instagram', patterns: ['instagram.com/', 'instagr.am/'], icon: 'instagram' },
      { name: 'twitter', patterns: ['twitter.com/', 'x.com/'], icon: 'twitter' },
      { name: 'linkedin', patterns: ['linkedin.com/company/', 'linkedin.com/in/'], icon: 'linkedin' },
      { name: 'youtube', patterns: ['youtube.com/'], icon: 'youtube' },
      { name: 'tiktok', patterns: ['tiktok.com/@'], icon: 'tiktok' },
      { name: 'yelp', patterns: ['yelp.com/biz/'], icon: 'yelp' },
    ];
  }

  /**
   * Scan business for online presence
   */
  async scanBusinessPresence(businessData) {
    const results = {
      businessName: businessData.name,
      website: await this.checkWebsite(businessData.website),
      socialMedia: await this.findSocialMediaProfiles(businessData),
      onlineListings: await this.findOnlineListings(businessData),
      digitalPresenceScore: 0,
      recommendations: [],
    };

    // Calculate digital presence score
    results.digitalPresenceScore = this.calculatePresenceScore(results);
    
    // Generate recommendations
    results.recommendations = this.generateRecommendations(results);

    logger.info('Web presence scan completed', {
      type: 'web_presence',
      businessName: businessData.name,
      score: results.digitalPresenceScore,
    });

    return results;
  }

  /**
   * Check website status and details
   */
  async checkWebsite(websiteUrl) {
    if (!websiteUrl) {
      return {
        exists: false,
        accessible: false,
        hasSSL: false,
        loadTime: null,
        mobileResponsive: null,
        hasContactForm: null,
        hasOnlineBooking: null,
      };
    }

    try {
      const startTime = Date.now();
      
      // Use HEAD request to check accessibility
      const response = await fetch(websiteUrl, {
        method: 'HEAD',
        timeout: 10000,
      }).catch(() => null);

      const loadTime = Date.now() - startTime;
      const accessible = response && response.ok;

      // For full analysis, we'd need to fetch the HTML
      // This is a simplified version
      return {
        exists: true,
        accessible,
        hasSSL: websiteUrl.startsWith('https://'),
        loadTime,
        statusCode: response?.status,
        mobileResponsive: null, // Would need full HTML analysis
        hasContactForm: null,
        hasOnlineBooking: null,
      };
    } catch (error) {
      logger.error('Website check failed', {
        type: 'web_presence',
        url: websiteUrl,
        error: error.message,
      });

      return {
        exists: true,
        accessible: false,
        hasSSL: websiteUrl.startsWith('https://'),
        loadTime: null,
        error: error.message,
      };
    }
  }

  /**
   * Find social media profiles
   */
  async findSocialMediaProfiles(businessData) {
    const profiles = [];
    const searchQuery = `${businessData.name} ${businessData.address || ''}`;

    // In a real implementation, this would use:
    // 1. Google Custom Search API
    // 2. Social media APIs
    // 3. Web scraping (with proper permissions)
    
    // For now, we'll return a structure showing what would be found
    for (const platform of this.socialMediaPlatforms) {
      // Simulate finding profiles (in production, use actual API calls)
      const found = Math.random() > 0.6; // 40% chance of finding a profile
      
      if (found) {
        profiles.push({
          platform: platform.name,
          icon: platform.icon,
          url: `https://${platform.patterns[0]}${businessData.name.toLowerCase().replace(/\s+/g, '')}`,
          verified: Math.random() > 0.7,
          followers: Math.floor(Math.random() * 10000),
          lastPost: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
          active: Math.random() > 0.3,
        });
      }
    }

    return profiles;
  }

  /**
   * Find online business listings
   */
  async findOnlineListings(businessData) {
    const listings = [];

    // Common business listing sites
    const listingSites = [
      { name: 'Google My Business', url: 'google.com/maps', priority: 'high' },
      { name: 'Yelp', url: 'yelp.com', priority: 'high' },
      { name: 'Yellow Pages', url: 'yellowpages.com', priority: 'medium' },
      { name: 'Better Business Bureau', url: 'bbb.org', priority: 'medium' },
      { name: 'Foursquare', url: 'foursquare.com', priority: 'low' },
      { name: 'TripAdvisor', url: 'tripadvisor.com', priority: 'medium' },
    ];

    // Simulate finding listings
    for (const site of listingSites) {
      const found = Math.random() > 0.5;
      
      if (found) {
        listings.push({
          site: site.name,
          url: `https://${site.url}`,
          priority: site.priority,
          claimed: Math.random() > 0.5,
          rating: (Math.random() * 2 + 3).toFixed(1),
          reviewCount: Math.floor(Math.random() * 500),
          complete: Math.random() > 0.4,
        });
      }
    }

    return listings;
  }

  /**
   * Calculate digital presence score (0-100)
   */
  calculatePresenceScore(results) {
    let score = 0;

    // Website (40 points)
    if (results.website.exists) {
      score += 20;
      if (results.website.accessible) score += 10;
      if (results.website.hasSSL) score += 5;
      if (results.website.loadTime && results.website.loadTime < 3000) score += 5;
    }

    // Social Media (30 points)
    const socialScore = Math.min(30, results.socialMedia.length * 6);
    score += socialScore;

    // Online Listings (30 points)
    const listingScore = Math.min(30, results.onlineListings.length * 5);
    score += listingScore;

    return Math.min(100, Math.round(score));
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];

    // Website recommendations
    if (!results.website.exists) {
      recommendations.push({
        priority: 'critical',
        category: 'website',
        title: 'Create a Professional Website',
        description: 'No website detected. A website is essential for online visibility and credibility.',
        estimatedImpact: 'high',
        estimatedCost: '$500-2000',
        timeframe: '2-4 weeks',
      });
    } else {
      if (!results.website.accessible) {
        recommendations.push({
          priority: 'high',
          category: 'website',
          title: 'Fix Website Accessibility',
          description: 'Website exists but is not accessible. This could be losing you customers.',
          estimatedImpact: 'high',
          estimatedCost: '$200-500',
          timeframe: '1 week',
        });
      }
      if (!results.website.hasSSL) {
        recommendations.push({
          priority: 'high',
          category: 'security',
          title: 'Add SSL Certificate',
          description: 'Website lacks HTTPS security. This affects trust and SEO rankings.',
          estimatedImpact: 'medium',
          estimatedCost: '$0-100',
          timeframe: '1 day',
        });
      }
    }

    // Social media recommendations
    if (results.socialMedia.length === 0) {
      recommendations.push({
        priority: 'high',
        category: 'social_media',
        title: 'Establish Social Media Presence',
        description: 'No social media profiles found. Start with Facebook and Instagram.',
        estimatedImpact: 'high',
        estimatedCost: '$0',
        timeframe: '1 week',
      });
    } else if (results.socialMedia.length < 3) {
      recommendations.push({
        priority: 'medium',
        category: 'social_media',
        title: 'Expand Social Media Presence',
        description: 'Limited social media presence. Consider adding more platforms.',
        estimatedImpact: 'medium',
        estimatedCost: '$0',
        timeframe: '2 weeks',
      });
    }

    // Check for inactive social media
    const inactiveProfiles = results.socialMedia.filter(p => !p.active);
    if (inactiveProfiles.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'social_media',
        title: 'Reactivate Social Media Accounts',
        description: `${inactiveProfiles.length} inactive social media accounts detected. Regular posting improves engagement.`,
        estimatedImpact: 'medium',
        estimatedCost: '$0',
        timeframe: 'Ongoing',
      });
    }

    // Online listings recommendations
    const unclaimedListings = results.onlineListings.filter(l => !l.claimed);
    if (unclaimedListings.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'listings',
        title: 'Claim Business Listings',
        description: `${unclaimedListings.length} unclaimed business listings found. Claiming them improves local SEO.`,
        estimatedImpact: 'high',
        estimatedCost: '$0',
        timeframe: '1 week',
      });
    }

    if (results.onlineListings.length < 3) {
      recommendations.push({
        priority: 'medium',
        category: 'listings',
        title: 'Add More Business Listings',
        description: 'Limited online listings. Add your business to more directories for better visibility.',
        estimatedImpact: 'medium',
        estimatedCost: '$0',
        timeframe: '2 weeks',
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Batch scan multiple businesses
   */
  async batchScan(businesses, progressCallback) {
    const results = [];
    let completed = 0;

    for (const business of businesses) {
      try {
        const result = await this.scanBusinessPresence(business);
        results.push(result);
        completed++;

        if (progressCallback) {
          progressCallback({
            completed,
            total: businesses.length,
            progress: Math.round((completed / businesses.length) * 100),
            currentBusiness: business.name,
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Batch scan error', {
          type: 'web_presence',
          businessName: business.name,
          error: error.message,
        });
      }
    }

    return results;
  }
}

const webPresenceScanner = new WebPresenceScanner();
export default webPresenceScanner;
