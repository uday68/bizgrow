
import React, { useState } from 'react';
import { Search, MapPin, Globe, Phone, Star, Plus, Check, Loader2, Link as LinkIcon, FileText } from 'lucide-react';
import { searchLeads } from '../services/geminiService';
import { BusinessLead, SearchResult } from '../types';
import { apiService } from '../services/apiService';

interface LeadSearchProps {
  onSaveLead: (lead: BusinessLead) => void;
  savedLeadIds: string[];
}

interface QuotationService {
  type: string;
  name: string;
  description: string;
  basePrice: number;
}

const LeadSearch: React.FC<LeadSearchProps> = ({ onSaveLead, savedLeadIds }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<BusinessLead | null>(null);
  const [serviceCatalog, setServiceCatalog] = useState<QuotationService[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationSent, setQuotationSent] = useState(false);

  // Load service catalog when modal opens
  React.useEffect(() => {
    if (showQuotationModal && serviceCatalog.length === 0) {
      loadServiceCatalog();
    }
  }, [showQuotationModal]);

  const loadServiceCatalog = async () => {
    try {
      const response = await apiService.getServiceCatalog();
      if (response.success) {
        setServiceCatalog(response.data.services);
      }
    } catch (error) {
      console.error('Failed to load service catalog:', error);
    }
  };

  const openQuotationModal = (lead: BusinessLead) => {
    setSelectedLead(lead);
    setSelectedServices([]);
    setQuotationSent(false);
    setShowQuotationModal(true);
  };

  const toggleService = (serviceType: string) => {
    setSelectedServices(prev => 
      prev.includes(serviceType)
        ? prev.filter(s => s !== serviceType)
        : [...prev, serviceType]
    );
  };

  const sendQuotation = async () => {
    if (!selectedLead || selectedServices.length === 0) return;

    setQuotationLoading(true);
    try {
      const response = await apiService.generateQuotation({
        businessId: selectedLead.id,
        customerId: selectedLead.id,
        services: selectedServices,
        customerPreferences: {
          businessName: selectedLead.name,
          businessAddress: selectedLead.address
        }
      });

      if (!response.success) {
        throw new Error('Failed to generate quotation');
      }

      console.log('Quotation generated:', response.data);
      
      setQuotationSent(true);
      setTimeout(() => {
        setShowQuotationModal(false);
      }, 2000);

    } catch (error) {
      console.error('Failed to send quotation:', error);
      alert('Failed to send quotation. Please try again.');
    } finally {
      setQuotationLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      // Try to get user location
      let location = undefined;
      try {
        const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
        location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } catch (err) {
        console.warn("Geolocation denied, search might be less accurate.");
      }

      const searchResult = await searchLeads(query, location);
      setResults(searchResult);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Lead Finder</h1>
        <p className="text-slate-500">Search for businesses and identify growth opportunities.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-8 flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search e.g., 'Bakery in Manhattan' or 'Auto repairs in Austin'..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <Search size={20} />}
          Find Leads
        </button>
      </form>

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.leads.map((lead) => (
            <div key={lead.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{lead.name}</h3>
                  {savedLeadIds.includes(lead.id) ? (
                    <div className="bg-green-100 text-green-700 p-1 rounded-full">
                      <Check size={16} />
                    </div>
                  ) : (
                    <button
                      onClick={() => onSaveLead(lead)}
                      className="bg-slate-50 text-slate-600 hover:bg-indigo-600 hover:text-white p-1.5 rounded-full transition-colors"
                      title="Save as Lead"
                    >
                      <Plus size={18} />
                    </button>
                  )}
                </div>

                <div className="space-y-3 mb-6 text-sm">
                  <div className="flex items-start gap-2 text-slate-500">
                    <MapPin size={16} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{lead.address}</span>
                  </div>
                  {lead.rating && (
                    <div className="flex items-center gap-2 text-amber-500">
                      <Star size={16} fill="currentColor" />
                      <span className="font-semibold">{lead.rating}</span>
                      <span className="text-slate-400">({lead.reviewCount} reviews)</span>
                    </div>
                  )}
                  {lead.website ? (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-indigo-600 hover:underline">
                      <Globe size={16} />
                      <span className="truncate">{new URL(lead.website).hostname}</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 text-rose-500 font-medium">
                      <Globe size={16} />
                      <span>No Website Identified</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {lead.potentialServices.map((service, idx) => (
                    <span key={idx} className="bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
                      {service}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="border-t border-slate-50 p-4 bg-slate-50/50 flex justify-between items-center">
                <a 
                  href={lead.mapsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"
                >
                  <LinkIcon size={12} />
                  Google Maps
                </a>
                <button
                  onClick={() => openQuotationModal(lead)}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center gap-1 transition-colors"
                  title="Send Quotation"
                >
                  <FileText size={12} />
                  Send Quote
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {results && results.leads.length === 0 && !loading && (
        <div className="text-center py-20">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No leads found</h3>
          <p className="text-slate-500">Try adjusting your search terms or location.</p>
        </div>
      )}

      {results && results.groundingLinks.length > 0 && (
        <div className="mt-12 p-6 bg-white rounded-2xl border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Globe size={16} className="text-indigo-600" />
            Sources used by Gemini
          </h4>
          <div className="flex flex-wrap gap-4">
            {results.groundingLinks.map((link, idx) => (
              <a 
                key={idx} 
                href={link.uri} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-3 py-1.5 rounded-full"
              >
                {link.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Quotation Modal */}
      {showQuotationModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQuotationModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Send Quotation</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedLead.name}</p>
                </div>
                <button
                  onClick={() => setShowQuotationModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {quotationSent ? (
                <div className="text-center py-12">
                  <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="text-green-600" size={32} />
                  </div>
                  <h4 className="text-lg font-semibold text-slate-900 mb-2">Quotation Sent!</h4>
                  <p className="text-slate-500">The quotation has been generated and is ready for the customer.</p>
                </div>
              ) : (
                <>
                  <h4 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Select Services</h4>
                  
                  {serviceCatalog.length === 0 ? (
                    <div className="text-center py-8">
                      <Loader2 className="animate-spin text-indigo-600 mx-auto mb-2" size={32} />
                      <p className="text-slate-500">Loading services...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {serviceCatalog.map((service) => (
                        <div
                          key={service.type}
                          onClick={() => toggleService(service.type)}
                          className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                            selectedServices.includes(service.type)
                              ? 'border-indigo-600 bg-indigo-50'
                              : 'border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center ${
                              selectedServices.includes(service.type)
                                ? 'border-indigo-600 bg-indigo-600'
                                : 'border-slate-300'
                            }`}>
                              {selectedServices.includes(service.type) && (
                                <Check size={14} className="text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-1">
                                <h5 className="font-semibold text-slate-900">{service.name}</h5>
                                <span className="text-indigo-600 font-bold">${service.basePrice}</span>
                              </div>
                              <p className="text-sm text-slate-600">{service.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedServices.length > 0 && (
                    <div className="mt-6 p-4 bg-indigo-50 rounded-xl">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-700">
                          {selectedServices.length} service(s) selected
                        </span>
                        <span className="text-lg font-bold text-indigo-600">
                          ${serviceCatalog
                            .filter(s => selectedServices.includes(s.type))
                            .reduce((sum, s) => sum + s.basePrice, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                      {selectedServices.length >= 3 && (
                        <p className="text-xs text-green-600 mt-2">
                          ✨ 15% bulk discount will be applied!
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!quotationSent && (
              <div className="p-6 border-t border-slate-200 flex gap-3">
                <button
                  onClick={() => setShowQuotationModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendQuotation}
                  disabled={selectedServices.length === 0 || quotationLoading}
                  className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {quotationLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileText size={20} />
                      Send Quotation
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadSearch;
