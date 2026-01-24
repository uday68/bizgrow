import logger from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

/**
 * Shared Agent Memory System
 * Provides centralized memory and context sharing across all AI agents
 * (Discovery, Proposal, Builder, Chat Mediator)
 */
class SharedAgentMemory extends EventEmitter {
  constructor() {
    super();
    
    // Memory stores
    this.businessContext = new Map(); // businessId -> context
    this.conversationHistory = new Map(); // businessId -> conversation array
    this.agentInteractions = new Map(); // businessId -> agent interactions
    this.customerPreferences = new Map(); // customerId -> preferences
    this.quotations = new Map(); // quotationId -> quotation data
    
    // Cross-agent knowledge base
    this.knowledgeBase = {
      services: new Map(), // service type -> details
      pricing: new Map(), // service -> pricing info
      templates: new Map(), // template type -> template
      bestPractices: new Map() // category -> best practices
    };
    
    this.initialize();
  }

  initialize() {
    logger.info('Shared Agent Memory initializing', {
      type: 'agent_memory',
      category: 'service_startup'
    });

    // Initialize default knowledge base
    this.initializeKnowledgeBase();
    
    // Clean up old memories every hour
    setInterval(() => {
      this.cleanupOldMemories();
    }, 60 * 60 * 1000);
  }

  initializeKnowledgeBase() {
    // Service catalog
    this.knowledgeBase.services.set('website', {
      name: 'Professional Website Development',
      description: 'Custom responsive website with modern design',
      features: ['Responsive Design', 'SEO Optimization', 'Content Management', 'Analytics Integration'],
      basePrice: 2500,
      timeline: '2-4 weeks'
    });

    this.knowledgeBase.services.set('ecommerce', {
      name: 'E-Commerce Platform',
      description: 'Full-featured online store with payment integration',
      features: ['Product Catalog', 'Shopping Cart', 'Payment Gateway', 'Order Management', 'Inventory System'],
      basePrice: 5000,
      timeline: '4-8 weeks'
    });

    this.knowledgeBase.services.set('mobile-app', {
      name: 'Mobile Application',
      description: 'Native or cross-platform mobile app',
      features: ['iOS & Android', 'Push Notifications', 'Offline Support', 'Cloud Sync'],
      basePrice: 8000,
      timeline: '8-12 weeks'
    });

    this.knowledgeBase.services.set('digital-marketing', {
      name: 'Digital Marketing Package',
      description: 'Comprehensive digital marketing strategy',
      features: ['SEO', 'Social Media Management', 'Content Marketing', 'Email Campaigns', 'Analytics'],
      basePrice: 1500,
      timeline: 'Monthly subscription'
    });

    this.knowledgeBase.services.set('crm', {
      name: 'CRM System',
      description: 'Customer relationship management solution',
      features: ['Contact Management', 'Sales Pipeline', 'Email Integration', 'Reporting'],
      basePrice: 3500,
      timeline: '3-6 weeks'
    });

    // Pricing strategies
    this.knowledgeBase.pricing.set('discount_bulk', {
      threshold: 3,
      discount: 0.15,
      description: '15% discount for 3+ services'
    });

    this.knowledgeBase.pricing.set('discount_referral', {
      discount: 0.10,
      description: '10% discount for referrals'
    });

    logger.info('Knowledge base initialized', {
      type: 'agent_memory',
      services: this.knowledgeBase.services.size,
      pricingRules: this.knowledgeBase.pricing.size
    });
  }

  // Store business context from any agent
  storeBusinessContext(businessId, agentType, context) {
    if (!this.businessContext.has(businessId)) {
      this.businessContext.set(businessId, {
        businessId,
        createdAt: new Date(),
        lastUpdated: new Date(),
        agents: {}
      });
    }

    const businessCtx = this.businessContext.get(businessId);
    businessCtx.agents[agentType] = {
      ...context,
      timestamp: new Date()
    };
    businessCtx.lastUpdated = new Date();

    logger.info('Business context stored', {
      type: 'agent_memory',
      businessId,
      agentType,
      contextKeys: Object.keys(context)
    });

    this.emit('contextUpdated', { businessId, agentType, context });
  }

  // Get complete business context (all agents)
  getBusinessContext(businessId) {
    return this.businessContext.get(businessId) || null;
  }

  // Store conversation message
  storeConversation(businessId, message) {
    if (!this.conversationHistory.has(businessId)) {
      this.conversationHistory.set(businessId, []);
    }

    const conversation = this.conversationHistory.get(businessId);
    conversation.push({
      ...message,
      timestamp: new Date()
    });

    // Keep only last 100 messages
    if (conversation.length > 100) {
      conversation.shift();
    }

    this.emit('conversationUpdated', { businessId, message });
  }

  // Get conversation history
  getConversationHistory(businessId, limit = 50) {
    const history = this.conversationHistory.get(businessId) || [];
    return history.slice(-limit);
  }

  // Store agent interaction
  storeAgentInteraction(businessId, agentType, action, result) {
    if (!this.agentInteractions.has(businessId)) {
      this.agentInteractions.set(businessId, []);
    }

    const interactions = this.agentInteractions.get(businessId);
    interactions.push({
      agentType,
      action,
      result,
      timestamp: new Date()
    });

    logger.info('Agent interaction stored', {
      type: 'agent_memory',
      businessId,
      agentType,
      action
    });
  }

  // Get agent interactions
  getAgentInteractions(businessId, agentType = null) {
    const interactions = this.agentInteractions.get(businessId) || [];
    
    if (agentType) {
      return interactions.filter(i => i.agentType === agentType);
    }
    
    return interactions;
  }

  // Store customer preferences
  storeCustomerPreferences(customerId, preferences) {
    this.customerPreferences.set(customerId, {
      ...preferences,
      updatedAt: new Date()
    });

    logger.info('Customer preferences stored', {
      type: 'agent_memory',
      customerId,
      preferenceKeys: Object.keys(preferences)
    });
  }

  // Get customer preferences
  getCustomerPreferences(customerId) {
    return this.customerPreferences.get(customerId) || null;
  }

  // Create quotation
  createQuotation(businessId, customerId, services, options = {}) {
    const quotationId = uuidv4();
    
    // Calculate pricing
    const serviceDetails = services.map(serviceType => {
      const service = this.knowledgeBase.services.get(serviceType);
      if (!service) {
        throw new Error(`Unknown service type: ${serviceType}`);
      }
      return {
        type: serviceType,
        ...service
      };
    });

    let totalPrice = serviceDetails.reduce((sum, s) => sum + s.basePrice, 0);
    const discounts = [];

    // Apply bulk discount
    if (services.length >= 3) {
      const bulkDiscount = this.knowledgeBase.pricing.get('discount_bulk');
      const discountAmount = totalPrice * bulkDiscount.discount;
      totalPrice -= discountAmount;
      discounts.push({
        type: 'bulk',
        description: bulkDiscount.description,
        amount: discountAmount
      });
    }

    // Apply referral discount if applicable
    if (options.isReferral) {
      const referralDiscount = this.knowledgeBase.pricing.get('discount_referral');
      const discountAmount = totalPrice * referralDiscount.discount;
      totalPrice -= discountAmount;
      discounts.push({
        type: 'referral',
        description: referralDiscount.description,
        amount: discountAmount
      });
    }

    const quotation = {
      id: quotationId,
      businessId,
      customerId,
      services: serviceDetails,
      pricing: {
        subtotal: serviceDetails.reduce((sum, s) => sum + s.basePrice, 0),
        discounts,
        total: totalPrice
      },
      status: 'draft', // draft, sent, viewed, accepted, rejected
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: new Date(),
      metadata: options.metadata || {}
    };

    this.quotations.set(quotationId, quotation);

    logger.info('Quotation created', {
      type: 'agent_memory',
      quotationId,
      businessId,
      customerId,
      services: services.length,
      total: totalPrice
    });

    this.emit('quotationCreated', quotation);

    return quotation;
  }

  // Get quotation
  getQuotation(quotationId) {
    return this.quotations.get(quotationId) || null;
  }

  // Update quotation status
  updateQuotationStatus(quotationId, status, metadata = {}) {
    const quotation = this.quotations.get(quotationId);
    if (!quotation) {
      throw new Error('Quotation not found');
    }

    quotation.status = status;
    quotation.updatedAt = new Date();
    quotation.metadata = {
      ...quotation.metadata,
      ...metadata
    };

    if (status === 'sent') {
      quotation.sentAt = new Date();
    } else if (status === 'viewed') {
      quotation.viewedAt = new Date();
    } else if (status === 'accepted' || status === 'rejected') {
      quotation.respondedAt = new Date();
    }

    logger.info('Quotation status updated', {
      type: 'agent_memory',
      quotationId,
      status,
      businessId: quotation.businessId
    });

    this.emit('quotationStatusChanged', { quotationId, status, quotation });

    return quotation;
  }

  // Get all quotations for a business
  getBusinessQuotations(businessId) {
    const quotations = [];
    for (const [id, quotation] of this.quotations) {
      if (quotation.businessId === businessId) {
        quotations.push(quotation);
      }
    }
    return quotations.sort((a, b) => b.createdAt - a.createdAt);
  }

  // Get service catalog
  getServiceCatalog() {
    return Array.from(this.knowledgeBase.services.entries()).map(([type, service]) => ({
      type,
      ...service
    }));
  }

  // Get service details
  getServiceDetails(serviceType) {
    return this.knowledgeBase.services.get(serviceType) || null;
  }

  // Generate context summary for AI agents
  generateContextSummary(businessId) {
    const context = this.businessContext.get(businessId);
    const conversations = this.conversationHistory.get(businessId) || [];
    const interactions = this.agentInteractions.get(businessId) || [];
    const quotations = this.getBusinessQuotations(businessId);

    if (!context) {
      return null;
    }

    return {
      business: context,
      recentConversations: conversations.slice(-10),
      agentInteractions: interactions.slice(-20),
      quotations,
      summary: {
        totalConversations: conversations.length,
        totalInteractions: interactions.length,
        totalQuotations: quotations.length,
        lastActivity: context.lastUpdated,
        involvedAgents: Object.keys(context.agents)
      }
    };
  }

  // Clean up old memories
  cleanupOldMemories() {
    const now = new Date();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    let cleanedCount = 0;

    // Clean old business contexts
    for (const [businessId, context] of this.businessContext) {
      if (now - context.lastUpdated > maxAge) {
        this.businessContext.delete(businessId);
        this.conversationHistory.delete(businessId);
        this.agentInteractions.delete(businessId);
        cleanedCount++;
      }
    }

    // Clean expired quotations
    for (const [quotationId, quotation] of this.quotations) {
      if (now > quotation.validUntil && quotation.status === 'draft') {
        this.quotations.delete(quotationId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Old memories cleaned up', {
        type: 'agent_memory',
        cleanedCount,
        remainingContexts: this.businessContext.size,
        remainingQuotations: this.quotations.size
      });
    }
  }

  // Get statistics
  getStatistics() {
    return {
      businessContexts: this.businessContext.size,
      conversationHistories: this.conversationHistory.size,
      agentInteractions: Array.from(this.agentInteractions.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      customerPreferences: this.customerPreferences.size,
      quotations: {
        total: this.quotations.size,
        draft: Array.from(this.quotations.values()).filter(q => q.status === 'draft').length,
        sent: Array.from(this.quotations.values()).filter(q => q.status === 'sent').length,
        accepted: Array.from(this.quotations.values()).filter(q => q.status === 'accepted').length
      },
      knowledgeBase: {
        services: this.knowledgeBase.services.size,
        pricingRules: this.knowledgeBase.pricing.size
      }
    };
  }
}

// Create singleton instance
const sharedAgentMemory = new SharedAgentMemory();

export default sharedAgentMemory;
export { SharedAgentMemory };
