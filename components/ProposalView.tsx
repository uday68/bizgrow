
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Sparkles, 
  CheckCircle, 
  Send, 
  Download, 
  Layout, 
  BarChart3, 
  Package, 
  Truck, 
  TrendingUp,
  Loader2,
  Printer
} from 'lucide-react';
import { BusinessLead, Proposal } from '../types';
import { generateProposal } from '../services/geminiService';

interface ProposalViewProps {
  leads: BusinessLead[];
}

const ProposalView: React.FC<ProposalViewProps> = ({ leads }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const lead = leads.find(l => l.id === id);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lead) {
      handleGenerate();
    }
  }, [lead]);

  const handleGenerate = async () => {
    if (!lead) return;
    setLoading(true);
    try {
      const p = await generateProposal(lead);
      setProposal(p);
    } catch (err) {
      console.error("Failed to generate proposal", err);
    } finally {
      setLoading(false);
    }
  };

  if (!lead) return <div className="p-10 text-center">Lead not found</div>;

  const getServiceIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('website') || t.includes('presence')) return <Layout className="text-indigo-600" size={24} />;
    if (t.includes('marketing') || t.includes('seo')) return <BarChart3 className="text-emerald-600" size={24} />;
    if (t.includes('stock') || t.includes('inventory')) return <Package className="text-amber-600" size={24} />;
    if (t.includes('delivery') || t.includes('order')) return <Truck className="text-rose-600" size={24} />;
    return <TrendingUp className="text-slate-600" size={24} />;
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8 no-print">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium">
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <div className="flex gap-3">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer size={18} />
            Print PDF
          </button>
          <button 
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl font-semibold hover:bg-indigo-100 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
            Regenerate AI Pitch
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl p-20 border border-slate-200 text-center space-y-4 shadow-sm">
          <Loader2 className="animate-spin mx-auto text-indigo-600" size={48} />
          <h2 className="text-xl font-bold text-slate-900">Brewing your digital strategy...</h2>
          <p className="text-slate-500">Gemini is analyzing the market and crafting a custom growth plan for {lead.name}.</p>
        </div>
      ) : proposal ? (
        <article className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden print:border-none print:shadow-none">
          {/* Header */}
          <header className="bg-slate-900 text-white p-10 md:p-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <TrendingUp size={24} />
              </div>
              <span className="font-bold tracking-tight">BizGrow IT Solutions</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
              Digital Growth Proposal for {proposal.businessName}
            </h1>
            <div className="h-1 w-20 bg-indigo-500 rounded-full mb-8"></div>
            <p className="text-slate-400 text-lg max-w-2xl leading-relaxed">
              {proposal.introduction}
            </p>
          </header>

          {/* Content */}
          <div className="p-10 md:p-16 space-y-16">
            {/* Analysis */}
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <span className="bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center text-sm">01</span>
                Market Analysis & Gap
              </h2>
              <div className="bg-slate-50 p-8 rounded-2xl border border-slate-100">
                <p className="text-slate-700 leading-relaxed italic">
                  "{proposal.gapAnalysis}"
                </p>
              </div>
            </section>

            {/* Proposed Solutions */}
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                <span className="bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center text-sm">02</span>
                Growth Roadmap
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {proposal.proposedServices.map((service, idx) => (
                  <div key={idx} className="p-6 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group">
                    <div className="bg-white w-12 h-12 rounded-xl shadow-sm flex items-center justify-center mb-6 border border-slate-100 group-hover:scale-110 transition-transform">
                      {getServiceIcon(service.title)}
                    </div>
                    <h3 className="font-bold text-xl text-slate-900 mb-3">{service.title}</h3>
                    <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                      {service.description}
                    </p>
                    <div className="flex items-start gap-2 text-emerald-600 bg-emerald-50 p-3 rounded-lg text-xs font-semibold">
                      <CheckCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{service.benefit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Pricing / Engagement */}
            <section className="bg-slate-900 text-white p-10 rounded-3xl">
              <div className="flex flex-col md:flex-row gap-10 items-center">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-4">Investment Strategy</h2>
                  <p className="text-slate-400 leading-relaxed mb-8">
                    {proposal.pricingStrategy}
                  </p>
                  <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center gap-3 w-full md:w-auto justify-center no-print">
                    <Send size={20} />
                    Send to {lead.name}
                  </button>
                </div>
                <div className="hidden md:block w-48 h-48 bg-indigo-500/20 rounded-full border border-indigo-500/30 flex items-center justify-center">
                  <Sparkles size={64} className="text-indigo-400 opacity-50" />
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="pt-10 border-t border-slate-100 text-center text-slate-400 text-sm">
              <p>{proposal.cta}</p>
              <p className="mt-2">&copy; 2024 BizGrow IT Services. Confidential Proposal.</p>
            </footer>
          </div>
        </article>
      ) : (
        <div className="p-10 text-center">Failed to generate proposal. Please try again.</div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default ProposalView;
