import { GoogleGenAI, Type } from '@google/genai';
import logger from './logger.js';

class AIService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.useMock = !this.apiKey || 
                   this.apiKey === 'your_gemini_api_key_here' || 
                   process.env.NODE_ENV === 'test' || 
                   process.env.USE_MOCK_AI === 'true';
    
    if (!this.useMock) {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        logger.warn('Failed to initialize GoogleGenAI client, falling back to mock provider', { error: err.message });
        this.useMock = true;
      }
    }
  }

  getMockLeads(query, location) {
    const sanitizedQuery = (query || 'Local Business').trim();
    return [
      {
        id: `mock-lead-1-${Date.now()}`,
        name: `${sanitizedQuery} Premier Hub`,
        address: location ? `Near (${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)})` : '124 Commercial Avenue, Suite 100',
        rating: 4.6,
        reviewCount: 38,
        phoneNumber: '+1-555-0199',
        website: 'https://example.com/premier-hub',
        mapsUrl: 'https://maps.google.com/?q=premier+hub',
        status: 'new',
        potentialServices: ['SEO Optimization', 'App Development']
      },
      {
        id: `mock-lead-2-${Date.now()}`,
        name: `${sanitizedQuery} Express Services`,
        address: location ? `Near (${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)})` : '58 Market St, Downtown',
        rating: 4.1,
        reviewCount: 14,
        phoneNumber: '+1-555-0248',
        website: '',
        mapsUrl: 'https://maps.google.com/?q=express+services',
        status: 'new',
        potentialServices: ['Website Creation', 'Digital Presence']
      }
    ];
  }

  getMockProposal(lead) {
    const businessName = lead?.name || 'Valued Business';
    return {
      businessName,
      introduction: `We analyzed ${businessName}'s digital footprint and identified significant opportunities to expand customer acquisition and streamline daily operations.`,
      gapAnalysis: lead?.website 
        ? `While ${businessName} maintains an online presence, digital engagement metrics and search visibility can be accelerated through enhanced mobile workflows and SEO.` 
        : `${businessName} currently operates primarily offline, missing online discovery and automated appointment/order channels.`,
      proposedServices: [
        {
          title: lead?.website ? 'Full-Stack Workflow Optimization' : 'Modern Responsive Web Portal',
          description: 'Deploy high-performance web presence with customer self-service capabilities.',
          benefit: 'Increases direct customer inquiries and improves search discovery.'
        },
        {
          title: 'Automated Customer Engagement & Analytics',
          description: 'Integrated CRM messaging and engagement tracking.',
          benefit: 'Boosts repeat customer retention by up to 25%.'
        }
      ],
      pricingStrategy: 'Flexible milestone-based enterprise onboarding with zero upfront lock-in.',
      cta: 'Schedule a 15-minute technical discovery call to review custom implementation milestones.'
    };
  }

  async searchLeads(query, location) {
    if (!query || typeof query !== 'string') {
      throw new Error('Valid search query is required');
    }

    if (this.useMock) {
      logger.info('Serving AI searchLeads via deterministic mock provider', { query });
      return {
        leads: this.getMockLeads(query, location),
        groundingLinks: [
          {
            title: `${query} on Google Maps`,
            uri: `https://maps.google.com/?q=${encodeURIComponent(query)}`
          }
        ]
      };
    }

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Find businesses matching "${query}" in the area. Identify their contact details, if they have a website, and their general online reputation. Return a structured list.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: location ? {
              latLng: {
                latitude: location.latitude,
                longitude: location.longitude
              }
            } : undefined
          }
        }
      });

      const text = response.text || '';
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const groundingLinks = chunks.map((chunk) => ({
        title: chunk.maps?.title || 'View on Maps',
        uri: chunk.maps?.uri || '#'
      })).filter((link) => link.uri !== '#');

      const structurer = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on this information about businesses: "${text}", output a JSON array of business objects. Each object must have: id (string), name (string), address (string), rating (number), reviewCount (number), phoneNumber (string), website (string), mapsUrl (string). If a field is unknown, use null or empty string.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                address: { type: Type.STRING },
                rating: { type: Type.NUMBER },
                reviewCount: { type: Type.NUMBER },
                phoneNumber: { type: Type.STRING },
                website: { type: Type.STRING },
                mapsUrl: { type: Type.STRING },
              },
              required: ['id', 'name', 'address']
            }
          }
        }
      });

      const rawLeads = JSON.parse(structurer.text || '[]');
      const leads = rawLeads.map((lead) => ({
        ...lead,
        status: 'new',
        potentialServices: lead.website ? ['SEO Optimization', 'App Development'] : ['Website Creation', 'Digital Presence']
      }));

      return { leads, groundingLinks };
    } catch (error) {
      logger.error('Gemini searchLeads API call failed, falling back to mock results', { error: error.message });
      return {
        leads: this.getMockLeads(query, location),
        groundingLinks: []
      };
    }
  }

  async generateProposal(lead) {
    if (!lead || !lead.name) {
      throw new Error('Business lead with a valid name is required');
    }

    if (this.useMock) {
      logger.info('Serving AI generateProposal via deterministic mock provider', { leadName: lead.name });
      return this.getMockProposal(lead);
    }

    try {
      const prompt = `
        Generate a professional IT services proposal for a business named "${lead.name}".
        Details:
        - Address: ${lead.address || 'Address on file'}
        - Website: ${lead.website || 'No website found'}
        - Rating: ${lead.rating || 0}/5 from ${lead.reviewCount || 0} reviews.
        
        The proposal should focus on how IT services (Website, Stock Management, Online Orders, Delivery Assist, Marketing) can help them grow.
        Be persuasive but professional.
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              businessName: { type: Type.STRING },
              introduction: { type: Type.STRING },
              gapAnalysis: { type: Type.STRING },
              proposedServices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    benefit: { type: Type.STRING }
                  }
                }
              },
              pricingStrategy: { type: Type.STRING },
              cta: { type: Type.STRING }
            }
          }
        }
      });

      return JSON.parse(response.text || '{}');
    } catch (error) {
      logger.error('Gemini generateProposal API call failed, falling back to mock proposal', { error: error.message });
      return this.getMockProposal(lead);
    }
  }
}

export default new AIService();
