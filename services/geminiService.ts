import { BusinessLead, Proposal, SearchResult } from '../types';
import { apiService } from './apiService';

/**
 * Client-Side AI Service Adapter
 * 
 * Secure Enterprise Architecture:
 * - Credentials NEVER leave the server or enter browser bundles.
 * - Client dispatches validated requests to the backend /api/ai endpoints.
 * - Automatic fallback and offline support handled securely on server.
 */
export const searchLeads = async (
  query: string, 
  location?: { latitude: number; longitude: number }
): Promise<SearchResult> => {
  try {
    const response = await apiService.request('/api/ai/leads', {
      method: 'POST',
      body: JSON.stringify({ query, location }),
    });

    if (response && response.leads) {
      return {
        leads: response.leads,
        groundingLinks: response.groundingLinks || []
      };
    }

    return { leads: [], groundingLinks: [] };
  } catch (error) {
    console.error('Failed to search leads via server-side AI adapter:', error);
    return { leads: [], groundingLinks: [] };
  }
};

export const generateProposal = async (lead: BusinessLead): Promise<Proposal> => {
  try {
    const response = await apiService.request('/api/ai/proposals', {
      method: 'POST',
      body: JSON.stringify({ lead }),
    });

    if (response && response.proposal) {
      return response.proposal;
    }

    throw new Error('Invalid proposal response from server');
  } catch (error) {
    console.error('Failed to generate proposal via server-side AI adapter:', error);
    throw error;
  }
};
