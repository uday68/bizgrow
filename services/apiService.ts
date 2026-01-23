const getApiBaseUrl = () => {
  // Check if we're in production and have a custom API URL
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Production fallback - try to detect the backend URL
  if (import.meta.env.PROD) {
    const currentHost = window.location.host;
    
    // Railway deployment
    if (currentHost.includes('railway.app')) {
      return `https://${currentHost.replace('-frontend', '-server')}/api`;
    }
    
    // Render deployment
    if (currentHost.includes('onrender.com')) {
      return `https://${currentHost.replace('-frontend', '-server')}/api`;
    }
    
    // Vercel deployment - connect to Railway backend
    if (currentHost.includes('vercel.app')) {
      return 'https://biggrow-production.up.railway.app/api';
    }
    
    // Netlify deployment - connect to Railway backend
    if (currentHost.includes('netlify.app')) {
      return 'https://biggrow-production.up.railway.app/api';
    }
    
    // Default production API - Railway backend
    return 'https://biggrow-production.up.railway.app/api';
  }
  
  // Development
  return 'http://localhost:3001/api';
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Developer Dashboard APIs
  async getDeveloperMetrics() {
    return this.request('/developer/metrics');
  }

  async toggleAgent(agentId: string) {
    return this.request(`/agents/${agentId}/toggle`, {
      method: 'POST',
    });
  }

  async triggerBulkDiscovery(regions: string[]) {
    return this.request('/agents/discovery/bulk-scan', {
      method: 'POST',
      body: JSON.stringify({ regions }),
    });
  }

  // Business APIs
  async getBusinesses() {
    return this.request('/businesses');
  }

  async getBusinessById(id: string) {
    return this.request(`/businesses/${id}`);
  }

  // Proposal APIs
  async generateProposal(businessId: string) {
    return this.request('/proposals/generate', {
      method: 'POST',
      body: JSON.stringify({ businessId }),
    });
  }

  async getProposals() {
    return this.request('/proposals');
  }

  async getProposalById(id: string) {
    return this.request(`/proposals/${id}`);
  }

  // Project APIs
  async buildProject(businessId: string, projectType: string = 'website') {
    return this.request('/projects/build', {
      method: 'POST',
      body: JSON.stringify({ businessId, projectType }),
    });
  }

  async getProjects() {
    return this.request('/projects');
  }

  async getProjectById(id: string) {
    return this.request(`/projects/${id}`);
  }

  // Analytics APIs
  async getRegionalAnalytics() {
    return this.request('/analytics/regional');
  }

  async getPerformanceMetrics() {
    return this.request('/analytics/performance');
  }

  // Agent Management APIs
  async getAgentStatus() {
    return this.request('/agents/status');
  }

  async updateAgentConfig(agentId: string, config: any) {
    return this.request(`/agents/${agentId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // Search and Discovery APIs
  async searchBusinesses(query: string, location?: { latitude: number; longitude: number }) {
    return this.request('/search/businesses', {
      method: 'POST',
      body: JSON.stringify({ query, location }),
    });
  }

  async discoverBusinessesInRegion(region: string, businessType: string) {
    return this.request('/discovery/region', {
      method: 'POST',
      body: JSON.stringify({ region, businessType }),
    });
  }
}

export const apiService = new ApiService();