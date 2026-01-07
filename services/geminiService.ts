
import { GoogleGenAI, Type } from "@google/genai";
import { BusinessLead, Proposal, SearchResult } from "../types";

const API_KEY = process.env.API_KEY || "";

export const searchLeads = async (query: string, location?: { latitude: number; longitude: number }): Promise<SearchResult> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
    },
  });

  const text = response.text || "";
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  
  const groundingLinks = chunks.map((chunk: any) => ({
    title: chunk.maps?.title || "View on Maps",
    uri: chunk.maps?.uri || "#"
  })).filter((link: any) => link.uri !== "#");

  // Since response.text is Markdown, we use another prompt to strictly structure the leads for the UI
  // This is a "parsing" step via Gemini for better UX
  const structurer = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on this information about businesses: "${text}", output a JSON array of business objects. Each object must have: id (string), name (string), address (string), rating (number), reviewCount (number), phoneNumber (string), website (string), mapsUrl (string). If a field is unknown, use null or empty string.`,
    config: {
      responseMimeType: "application/json",
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
          required: ["id", "name", "address"]
        }
      }
    }
  });

  const leads: BusinessLead[] = JSON.parse(structurer.text).map((lead: any) => ({
    ...lead,
    status: 'new',
    potentialServices: lead.website ? ['SEO Optimization', 'App Development'] : ['Website Creation', 'Digital Presence']
  }));

  return { leads, groundingLinks };
};

export const generateProposal = async (lead: BusinessLead): Promise<Proposal> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const prompt = `
    Generate a professional IT services proposal for a business named "${lead.name}".
    Details:
    - Address: ${lead.address}
    - Website: ${lead.website || 'No website found'}
    - Rating: ${lead.rating}/5 from ${lead.reviewCount} reviews.
    
    The proposal should focus on how IT services (Website, Stock Management, Online Orders, Delivery Assist, Marketing) can help them grow.
    Be persuasive but professional.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
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

  return JSON.parse(response.text);
};
