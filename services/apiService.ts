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
      const apiUrl = `https://${currentHost.replace('-frontend', '-server')}`;
      console.log('Railway deployment detected, using:', apiUrl);
      return apiUrl;
    }
    
    // Render deployment
    if (currentHost.includes('onrender.com')) {
      const apiUrl = `https://${currentHost.replace('-frontend', '-server')}`;
      console.log('Render deployment detected, using:', apiUrl);
      return apiUrl;
    }
    
    // Vercel deployment - connect to Railway backend
    if (currentHost.includes('vercel.app')) {
      const apiUrl = 'https://biggrow-production.up.railway.app';
      console.log('Vercel deployment detected, using Railway backend:', apiUrl);
      return apiUrl;
    }
    
    // Netlify deployment - connect to Railway backend
    if (currentHost.includes('netlify.app')) {
      const apiUrl = 'https://biggrow-production.up.railway.app';
      console.log('Netlify deployment detected, using Railway backend:', apiUrl);
      return apiUrl;
    }
    
    // Default production API - Railway backend
    const apiUrl = 'https://biggrow-production.up.railway.app';
    console.log('Default production, using Railway backend:', apiUrl);
    return apiUrl;
  }
  
  // Development
  const apiUrl = 'http://localhost:3001';
  console.log('Development mode, using:', apiUrl);
  return apiUrl;
};

const API_BASE_URL = getApiBaseUrl();

// Authentication token management
class AuthTokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'bizgrow_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'bizgrow_refresh_token';
  private static readonly USER_KEY = 'bizgrow_user';

  static getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static getUser(): any | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
  }

  static setTokens(accessToken: string, refreshToken: string, user: any) {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  static clearTokens() {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  static isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  static hasRole(role: string): boolean {
    const user = this.getUser();
    if (!user) return false;
    
    const roleHierarchy = { user: 1, developer: 2, admin: 3 };
    const userLevel = roleHierarchy[user.role as keyof typeof roleHierarchy] || 0;
    const requiredLevel = roleHierarchy[role as keyof typeof roleHierarchy] || 0;
    
    return userLevel >= requiredLevel;
  }
}

class ApiService {
  private async request(endpoint: string, options: RequestInit = {}, skipAuth = false) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log('Making API request to:', url);
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Add authentication header if not skipped and token exists
    if (!skipAuth && AuthTokenManager.isAuthenticated()) {
      const token = AuthTokenManager.getAccessToken();
      if (token) {
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${token}`,
        };
      }
    }

    try {
      const response = await fetch(url, config);
      
      console.log('API response status:', response.status);
      
      // Handle authentication errors
      if (response.status === 401 && !skipAuth) {
        console.log('Received 401, attempting token refresh...');
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry the original request with new token
          return this.request(endpoint, options, skipAuth);
        } else {
          // Refresh failed, redirect to login
          AuthTokenManager.clearTokens();
          window.location.href = '/login';
          throw new Error('Authentication failed');
        }
      }
      
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

  // Authentication APIs
  async login(email: string, password: string) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, true);

    if (response.success) {
      AuthTokenManager.setTokens(
        response.accessToken,
        response.refreshToken,
        response.user
      );
    }

    return response;
  }

  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
  }) {
    const response = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    }, true);

    if (response.success) {
      AuthTokenManager.setTokens(
        response.accessToken,
        response.refreshToken,
        response.user
      );
    }

    return response;
  }

  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = AuthTokenManager.getRefreshToken();
      if (!refreshToken) return false;

      const response = await this.request('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }, true);

      if (response.success) {
        const user = AuthTokenManager.getUser();
        AuthTokenManager.setTokens(
          response.accessToken,
          response.refreshToken,
          user
        );
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    
    return false;
  }

  async logout() {
    try {
      await this.request('/api/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      AuthTokenManager.clearTokens();
    }
  }

  async getCurrentUser() {
    return this.request('/api/auth/me');
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return AuthTokenManager.isAuthenticated();
  }

  // Check if user has required role
  hasRole(role: string): boolean {
    return AuthTokenManager.hasRole(role);
  }

  // Get current user from local storage
  getUser() {
    return AuthTokenManager.getUser();
  }

  // Developer Dashboard APIs
  async getDeveloperMetrics() {
    return this.request('/api/developer/metrics');
  }

  async toggleAgent(agentId: string) {
    return this.request(`/api/agents/${agentId}/toggle`, {
      method: 'POST',
    });
  }

  async triggerBulkDiscovery(regions: string[]) {
    return this.request('/api/agents/discovery/bulk-scan', {
      method: 'POST',
      body: JSON.stringify({ regions }),
    });
  }

  // Business APIs
  async getBusinesses() {
    return this.request('/api/businesses');
  }

  async getBusinessById(id: string) {
    return this.request(`/api/businesses/${id}`);
  }

  // Proposal APIs
  async generateProposal(businessId: string) {
    return this.request('/api/proposals/generate', {
      method: 'POST',
      body: JSON.stringify({ businessId }),
    });
  }

  async getProposals() {
    return this.request('/api/proposals');
  }

  async getProposalById(id: string) {
    return this.request(`/api/proposals/${id}`);
  }

  // Project APIs
  async buildProject(businessId: string, projectType: string = 'website') {
    return this.request('/api/projects/build', {
      method: 'POST',
      body: JSON.stringify({ businessId, projectType }),
    });
  }

  async getProjects() {
    return this.request('/api/projects');
  }

  async getProjectById(id: string) {
    return this.request(`/api/projects/${id}`);
  }

  // Analytics APIs
  async getRegionalAnalytics() {
    return this.request('/api/analytics/regional');
  }

  async getPerformanceMetrics() {
    return this.request('/api/analytics/performance');
  }

  // Agent Management APIs
  async getAgentStatus() {
    return this.request('/api/agents/status');
  }

  async updateAgentConfig(agentId: string, config: any) {
    return this.request(`/api/agents/${agentId}/config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  // Search and Discovery APIs
  async searchBusinesses(query: string, location?: { latitude: number; longitude: number }) {
    return this.request('/api/search/businesses', {
      method: 'POST',
      body: JSON.stringify({ query, location }),
    });
  }

  async discoverBusinessesInRegion(region: string, businessType: string) {
    return this.request('/api/discovery/region', {
      method: 'POST',
      body: JSON.stringify({ region, businessType }),
    });
  }

  // Rate Limiting Management APIs (Admin only)
  async getRateLimitAnalytics() {
    return this.request('/api/rate-limit/analytics');
  }

  async getRateLimitStatus(key: string) {
    return this.request(`/api/rate-limit/status/${key}`);
  }

  async resetRateLimit(key: string) {
    return this.request(`/api/rate-limit/reset/${key}`, {
      method: 'POST',
    });
  }

  async getWhitelist() {
    return this.request('/api/rate-limit/whitelist');
  }

  async addToWhitelist(ip: string, reason?: string) {
    return this.request('/api/rate-limit/whitelist', {
      method: 'POST',
      body: JSON.stringify({ ip, reason }),
    });
  }

  async removeFromWhitelist(ip: string) {
    return this.request(`/api/rate-limit/whitelist/${ip}`, {
      method: 'DELETE',
    });
  }

  // Chat APIs
  async createChatSession(customerInfo: {
    customerId?: string;
    name: string;
    email?: string;
  }) {
    return this.request('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ customerInfo }),
    }, true); // Skip auth for public chat
  }

  async getChatSession(sessionId: string) {
    return this.request(`/api/chat/sessions/${sessionId}`, {}, true);
  }

  async sendChatMessage(sessionId: string, content: string, senderId?: string) {
    return this.request(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        senderType: 'customer',
        senderId: senderId || 'anonymous',
      }),
    }, true);
  }

  async closeChatSession(sessionId: string, reason?: string) {
    return this.request(`/api/chat/sessions/${sessionId}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Session ended by customer' }),
    }, true);
  }

  async getChatStatistics() {
    return this.request('/api/chat/statistics');
  }

  async getActiveChatSessions(filters?: { status?: string; agentId?: string; limit?: number }) {
    const params = new URLSearchParams(filters as any).toString();
    return this.request(`/api/chat/sessions${params ? `?${params}` : ''}`);
  }

  // Quotation APIs
  async generateQuotation(data: {
    businessId: string;
    customerId: string;
    services: string[];
    customerPreferences?: any;
  }) {
    return this.request('/api/chat/quotations/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true); // Skip auth for public quotation generation
  }

  async getQuotation(quotationId: string) {
    return this.request(`/api/chat/quotations/${quotationId}`, {}, true);
  }

  async acceptQuotation(quotationId: string, customerId: string, message?: string) {
    return this.request(`/api/chat/quotations/${quotationId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ customerId, message }),
    }, true);
  }

  async rejectQuotation(quotationId: string, customerId: string, reason?: string) {
    return this.request(`/api/chat/quotations/${quotationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ customerId, reason }),
    }, true);
  }

  async getBusinessQuotations(businessId: string) {
    return this.request(`/api/chat/quotations/business/${businessId}`, {}, true);
  }

  async getServiceCatalog() {
    return this.request('/api/chat/services/catalog', {}, true);
  }

  async getServiceRecommendations(customerMessage: string, businessContext?: any) {
    return this.request('/api/chat/services/recommend', {
      method: 'POST',
      body: JSON.stringify({ customerMessage, businessContext }),
    }, true);
  }

  async getSharedMemoryStatistics() {
    return this.request('/api/chat/memory/statistics');
  }
}
export const apiService = new ApiService();