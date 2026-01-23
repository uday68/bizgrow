import { GoogleGenAI, Type } from '@google/genai';
import { getDatabase, logActivity, updateAgentStatus } from '../database/init.js';

class BusinessDiscoveryAgent {
  constructor() {
    this.isActive = true;
    this.currentTask = null;
    
    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable is not set');
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.geminiAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    this.discoveryQueue = [];
    this.isProcessing = false;
  }

  toggle() {
    this.isActive = !this.isActive;
    updateAgentStatus('discovery', this.isActive ? 'active' : 'idle');
    
    if (this.isActive && this.discoveryQueue.length > 0) {
      this.processQueue();
    }
  }

  async discoverBusinesses(query, region, limit = 10) {
    if (!this.isActive) {
      console.log('Discovery agent is inactive');
      return [];
    }

    this.currentTask = `Discovering businesses: ${query} in ${region}`;
    updateAgentStatus('discovery', 'active', this.currentTask);

    try {
      const response = await this.geminiAI.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: `Find ${limit} businesses matching "${query}" in ${region}. Focus on businesses that might need digital services like websites, online ordering, or digital marketing. Include contact details and assess their current digital presence.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              businesses: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    address: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    website: { type: Type.STRING },
                    rating: { type: Type.NUMBER },
                    reviewCount: { type: Type.NUMBER },
                    mapsUrl: { type: Type.STRING },
                    industry: { type: Type.STRING },
                    digitalPresenceScore: { type: Type.NUMBER },
                    opportunityScore: { type: Type.NUMBER }
                  }
                }
              }
            }
          }
        }
      });

      const result = JSON.parse(response.text);
      const businesses = result.businesses || [];

      // Save discovered businesses to database
      await this.saveBusinessesToDatabase(businesses, region);

      logActivity(
        'discovery',
        `${businesses.length} businesses`,
        null,
        `Discovered ${businesses.length} businesses in ${region}`,
        'success',
        { query, region, count: businesses.length }
      );

      updateAgentStatus('discovery', 'active', null, true);
      this.currentTask = null;

      return businesses;
    } catch (error) {
      console.error('Error in business discovery:', error);
      logActivity('discovery', 'Error', null, `Discovery failed: ${error.message}`, 'failed');
      this.currentTask = null;
      return [];
    }
  }

  async saveBusinessesToDatabase(businesses, region) {
    const db = getDatabase();
    
    for (const business of businesses) {
      const id = this.generateBusinessId(business.name, business.address);
      
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO businesses 
           (id, name, address, phone, website, rating, review_count, maps_url, region, industry, digital_presence_score, opportunity_score) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            business.name,
            business.address,
            business.phone || null,
            business.website || null,
            business.rating || 0,
            business.reviewCount || 0,
            business.mapsUrl || null,
            region,
            business.industry || 'Unknown',
            business.digitalPresenceScore || 0,
            business.opportunityScore || 0
          ],
          (err) => {
            if (err) {
              console.error('Error saving business:', err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    }
  }

  generateBusinessId(name, address) {
    return `biz_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
  }

  async startBulkDiscovery(regions, progressCallback) {
    if (!this.isActive) {
      throw new Error('Discovery agent is not active');
    }

    const queries = [
      'restaurants without websites',
      'local retail stores',
      'auto repair shops',
      'beauty salons',
      'fitness centers',
      'medical practices',
      'legal services',
      'home services'
    ];

    let totalTasks = regions.length * queries.length;
    let completedTasks = 0;

    for (const region of regions) {
      for (const query of queries) {
        try {
          await this.discoverBusinesses(query, region, 5);
          completedTasks++;
          
          if (progressCallback) {
            progressCallback({
              region,
              query,
              progress: Math.round((completedTasks / totalTasks) * 100),
              completed: completedTasks,
              total: totalTasks
            });
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Error in bulk discovery for ${query} in ${region}:`, error);
        }
      }
    }

    logActivity(
      'discovery',
      'Bulk Discovery',
      null,
      `Completed bulk discovery across ${regions.length} regions`,
      'success',
      { regions, totalTasks, completedTasks }
    );
  }

  async runAutomatedDiscovery() {
    if (!this.isActive) {
      return;
    }

    const regions = ['New York', 'Los Angeles', 'Chicago', 'Austin', 'Miami'];
    const randomRegion = regions[Math.floor(Math.random() * regions.length)];
    
    const queries = [
      'new restaurants',
      'small businesses',
      'local services',
      'retail stores'
    ];
    const randomQuery = queries[Math.floor(Math.random() * queries.length)];

    console.log(`Running automated discovery: ${randomQuery} in ${randomRegion}`);
    
    try {
      await this.discoverBusinesses(randomQuery, randomRegion, 3);
    } catch (error) {
      console.error('Automated discovery failed:', error);
    }
  }

  async getHighOpportunityBusinesses(limit = 20) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM businesses 
         WHERE opportunity_score > 70 AND status = 'discovered'
         ORDER BY opportunity_score DESC, created_at DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async processQueue() {
    if (this.isProcessing || !this.isActive) {
      return;
    }

    this.isProcessing = true;

    while (this.discoveryQueue.length > 0 && this.isActive) {
      const task = this.discoveryQueue.shift();
      try {
        await this.discoverBusinesses(task.query, task.region, task.limit);
      } catch (error) {
        console.error('Error processing discovery queue:', error);
      }
    }

    this.isProcessing = false;
  }

  addToQueue(query, region, limit = 10) {
    this.discoveryQueue.push({ query, region, limit });
    
    if (this.isActive && !this.isProcessing) {
      this.processQueue();
    }
  }

  getStatus() {
    return {
      isActive: this.isActive,
      currentTask: this.currentTask,
      queueLength: this.discoveryQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

export default BusinessDiscoveryAgent;