import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  MapPin,
  Globe,
  Star,
  Plus,
  Check,
  Loader2,
  Link as LinkIcon,
  Filter,
  Map as MapIcon,
  List,
  X,
  Phone,
  Clock,
  Image as ImageIcon,
} from 'lucide-react';
import { searchLeads } from '../services/geminiService';
import { googleMapsService, Location, NearbyPlace } from '../services/googleMapsService';
import { BusinessLead, SearchResult } from '../types';

interface EnhancedLeadSearchProps {
  onSaveLead: (lead: BusinessLead) => void;
  savedLeadIds: string[];
}

interface SearchFilters {
  minRating: number;
  maxDistance: number;
  businessType: string;
  hasWebsite: boolean | null;
  isOpen: boolean | null;
}

const EnhancedLeadSearch: React.FC<EnhancedLeadSearchProps> = ({ onSaveLead, savedLeadIds }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const [filters, setFilters] = useState<SearchFilters>({
    minRating: 0,
    maxDistance: 10,
    businessType: 'all',
    hasWebsite: null,
    isOpen: null,
  });

  // Get user location on mount
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.warn('Geolocation denied:', err);
      }
    );
  }, []);

  // Initialize Google Map
  useEffect(() => {
    if (viewMode === 'map' && mapRef.current && !googleMapRef.current && window.google) {
      googleMapRef.current = new google.maps.Map(mapRef.current, {
        center: userLocation || { lat: 40.7128, lng: -74.006 },
        zoom: 12,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      });
    }
  }, [viewMode, userLocation]);

  // Update map markers when results change
  useEffect(() => {
    if (googleMapRef.current && viewMode === 'map') {
      // Clear existing markers
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

      // Add new markers
      const allBusinesses = [...(results?.leads || []), ...nearbyPlaces];
      allBusinesses.forEach((business) => {
        if (business.location || (business as any).address) {
          const marker = new google.maps.Marker({
            position: business.location || { lat: 0, lng: 0 },
            map: googleMapRef.current!,
            title: business.name,
            icon: {
              url: business.website
                ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
                : 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
            },
          });

          marker.addListener('click', () => {
            setSelectedBusiness(business.id || (business as any).placeId);
          });

          markersRef.current.push(marker);
        }
      });

      // Fit bounds to show all markers
      if (markersRef.current.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        markersRef.current.forEach((marker) => {
          const position = marker.getPosition();
          if (position) bounds.extend(position);
        });
        googleMapRef.current.fitBounds(bounds);
      }
    }
  }, [results, nearbyPlaces, viewMode]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;

    setLoading(true);
    try {
      // Get location
      let location = userLocation;
      if (!location) {
        try {
          const pos: any = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej)
          );
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(location);
        } catch (err) {
          console.warn('Geolocation denied');
        }
      }

      // Search with Gemini AI
      const searchResult = await searchLeads(query, location);
      setResults(searchResult);

      // Also search with Google Maps API for additional data
      if (location) {
        const nearby = await googleMapsService.findNearbyBusinesses(
          location,
          filters.maxDistance * 1000,
          filters.businessType === 'all' ? 'establishment' : filters.businessType,
          query
        );
        setNearbyPlaces(nearby);
      }
    } catch (error) {
      console.error('Search failed', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (businesses: any[]) => {
    return businesses.filter((business) => {
      // Rating filter
      if (filters.minRating > 0 && (!business.rating || business.rating < filters.minRating)) {
        return false;
      }

      // Website filter
      if (filters.hasWebsite !== null) {
        const hasWebsite = !!business.website;
        if (filters.hasWebsite !== hasWebsite) return false;
      }

      // Distance filter
      if (userLocation && business.location) {
        const distance = googleMapsService.calculateDistance(userLocation, business.location);
        if (distance > filters.maxDistance) return false;
      }

      return true;
    });
  };

  const filteredResults = results
    ? { ...results, leads: applyFilters(results.leads) }
    : null;
  const filteredNearby = applyFilters(nearbyPlaces);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Enhanced Lead Finder</h1>
        <p className="text-slate-500">
          Search for businesses with advanced filters and map visualization.
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-4">
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

      {/* View Mode & Filters */}
      <div className="mb-6 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              viewMode === 'list'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <List size={18} />
            List View
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              viewMode === 'map'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <MapIcon size={18} />
            Map View
          </button>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2 rounded-lg bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
        >
          <Filter size={18} />
          Filters
          {showFilters && <X size={16} />}
        </button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="mb-6 p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Search Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Minimum Rating
              </label>
              <select
                value={filters.minRating}
                onChange={(e) =>
                  setFilters({ ...filters, minRating: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="0">Any Rating</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="4.5">4.5+ Stars</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Max Distance (km)
              </label>
              <input
                type="number"
                value={filters.maxDistance}
                onChange={(e) =>
                  setFilters({ ...filters, maxDistance: parseInt(e.target.value) })
                }
                min="1"
                max="50"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Business Type
              </label>
              <select
                value={filters.businessType}
                onChange={(e) => setFilters({ ...filters, businessType: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="all">All Types</option>
                <option value="restaurant">Restaurants</option>
                <option value="store">Retail Stores</option>
                <option value="cafe">Cafes</option>
                <option value="gym">Gyms</option>
                <option value="salon">Salons</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Website Status
              </label>
              <select
                value={filters.hasWebsite === null ? 'any' : filters.hasWebsite.toString()}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    hasWebsite:
                      e.target.value === 'any' ? null : e.target.value === 'true',
                  })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="any">Any</option>
                <option value="false">No Website</option>
                <option value="true">Has Website</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Map View */}
      {viewMode === 'map' && (
        <div
          ref={mapRef}
          className="w-full h-[600px] rounded-xl border border-slate-200 shadow-sm mb-6"
        />
      )}

      {/* List View */}
      {viewMode === 'list' && filteredResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResults.leads.map((lead) => (
            <BusinessCard
              key={lead.id}
              business={lead}
              isSaved={savedLeadIds.includes(lead.id)}
              onSave={() => onSaveLead(lead)}
              userLocation={userLocation}
            />
          ))}
        </div>
      )}

      {/* No Results */}
      {filteredResults && filteredResults.leads.length === 0 && !loading && (
        <div className="text-center py-20">
          <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No leads found</h3>
          <p className="text-slate-500">Try adjusting your search terms or filters.</p>
        </div>
      )}

      {/* Grounding Sources */}
      {filteredResults && filteredResults.groundingLinks.length > 0 && (
        <div className="mt-12 p-6 bg-white rounded-2xl border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Globe size={16} className="text-indigo-600" />
            Sources used by Gemini
          </h4>
          <div className="flex flex-wrap gap-4">
            {filteredResults.groundingLinks.map((link, idx) => (
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
    </div>
  );
};

// Business Card Component
const BusinessCard: React.FC<{
  business: any;
  isSaved: boolean;
  onSave: () => void;
  userLocation: Location | null;
}> = ({ business, isSaved, onSave, userLocation }) => {
  const distance = userLocation && business.location
    ? googleMapsService.calculateDistance(userLocation, business.location)
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
      {/* Photo */}
      {business.photos && business.photos.length > 0 && (
        <div className="h-48 overflow-hidden bg-slate-100">
          <img
            src={business.photos[0].url}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}

      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
            {business.name}
          </h3>
          {isSaved ? (
            <div className="bg-green-100 text-green-700 p-1 rounded-full">
              <Check size={16} />
            </div>
          ) : (
            <button
              onClick={onSave}
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
            <span className="line-clamp-2">{business.address}</span>
          </div>

          {distance && (
            <div className="flex items-center gap-2 text-slate-500">
              <MapIcon size={16} />
              <span>{distance.toFixed(1)} km away</span>
            </div>
          )}

          {business.rating && (
            <div className="flex items-center gap-2 text-amber-500">
              <Star size={16} fill="currentColor" />
              <span className="font-semibold">{business.rating}</span>
              <span className="text-slate-400">({business.reviewCount} reviews)</span>
            </div>
          )}

          {business.phone && (
            <div className="flex items-center gap-2 text-slate-500">
              <Phone size={16} />
              <span>{business.phone}</span>
            </div>
          )}

          {business.website ? (
            <a
              href={business.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:underline"
            >
              <Globe size={16} />
              <span className="truncate">{new URL(business.website).hostname}</span>
            </a>
          ) : (
            <div className="flex items-center gap-2 text-rose-500 font-medium">
              <Globe size={16} />
              <span>No Website Identified</span>
            </div>
          )}
        </div>

        {business.potentialServices && (
          <div className="flex flex-wrap gap-2 mb-4">
            {business.potentialServices.map((service: string, idx: number) => (
              <span
                key={idx}
                className="bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
              >
                {service}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-50 p-4 bg-slate-50/50 flex justify-between items-center">
        <a
          href={business.mapsUrl || `https://www.google.com/maps/place/?q=place_id:${business.placeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1"
        >
          <LinkIcon size={12} />
          Google Maps
        </a>
        <span className="text-[10px] text-slate-400 italic">High Potential</span>
      </div>
    </div>
  );
};

export default EnhancedLeadSearch;
