
export interface BusinessLead {
  id: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  phoneNumber?: string;
  website?: string;
  email?: string;
  mapsUrl: string;
  potentialServices: string[];
  status: 'new' | 'contacted' | 'interested' | 'converted';
  lastAnalyzed?: string;
}

export interface Proposal {
  leadId: string;
  businessName: string;
  introduction: string;
  gapAnalysis: string;
  proposedServices: {
    title: string;
    description: string;
    benefit: string;
  }[];
  pricingStrategy: string;
  cta: string;
}

export interface SearchResult {
  leads: BusinessLead[];
  groundingLinks: { title: string; uri: string }[];
}
