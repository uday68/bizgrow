const getApiBaseUrl = () => {
  // Check if we're in production and have a custom API URL
  if (import.meta.env.VITE_API_URL) {
    console.log('Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  // Production fallback - try to detect the backend URL
  if (import.meta.env.PROD) {
    const currentHost = window.location.host;
    console.log('Production mode, current host:', currentHost);
    
    // Railway deployment
    if (currentHost.includes('railway.app')) {
      const apiUrl = `https://${currentHost.replace('-frontend', '-server')}/api`;
      console.log('Railway deployment detected, using:', apiUrl);
      return apiUrl;
    }
    
    // Render deployment
    if (currentHost.includes('onrender.com')) {
      const apiUrl = `https://${currentHost.replace('-frontend', '-server')}/api`;
      console.log('Render deployment detected, using:', apiUrl);
      return apiUrl;
    }
    
    // Vercel deployment - connect to Railway backend
    if (currentHost.includes('vercel.app')) {
      const apiUrl = 'https://biggrow-production.up.railway.app/api';
      console.log('Vercel deployment detected, using Railway backend:', apiUrl);
      return apiUrl;
    }
    
    // Netlify deployment - connect to Railway backend
    if (currentHost.includes('netlify.app')) {
      const apiUrl = 'https://biggrow-production.up.railway.app/api';
      console.log('Netlify deployment detected, using Railway backend:', apiUrl);
      return apiUrl;
    }
    
    // Default production API - Railway backend
    const apiUrl = 'https://biggrow-production.up.railway.app/api';
    console.log('Default production, using Railway backend:', apiUrl);
    return apiUrl;
  }
  
  // Development
  const apiUrl = 'http://localhost:3001/api';
  console.log('Development mode, using:', apiUrl);
  return apiUrl;
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('Making API request to:', url);
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      console.log('API response status:', response.status);
      console.log('API response headers:', Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Non-JSON response received:', responseText.substring(0, 200));
        throw new Error(`Expected JSON response but got ${contentType}. Response: ${responseText.substring(0, 100)}...`);
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