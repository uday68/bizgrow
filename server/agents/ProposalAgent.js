import { GoogleGenAI, Type } from '@google/genai';
import { getDatabase, logActivity, updateAgentStatus } from '../database/init.js';
import nodemailer from 'nodemailer';

class ProposalAgent {
  constructor() {
    this.isActive = true;
    this.currentTask = null;
    
    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable is not set');
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.geminiAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    this.proposalQueue = [];
    this.isProcessing = false;
    this.emailTransporter = this.setupEmailTransporter();
  }

  setupEmailTransporter() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('Email configuration missing. Proposal sending will be simulated.');
      return null;
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  toggle() {
    this.isActive = !this.isActive;
    updateAgentStatus('proposal', this.isActive ? 'active' : 'idle');
    
    if (this.isActive && this.proposalQueue.length > 0) {
      this.processQueue();
    }
  }

  async generateProposal(businessId) {
    if (!this.isActive) {
      console.log('Proposal agent is inactive');
      return null;
    }

    const business = await this.getBusinessById(businessId);
    if (!business) {
      throw new Error('Business not found');
    }

    this.currentTask = `Generating proposal for ${business.name}`;
    updateAgentStatus('proposal', 'active', this.currentTask);

    try {
      const proposalContent = await this.createProposalContent(business);
      const proposalId = await this.saveProposal(businessId, proposalContent);

      // Attempt to send proposal if email is configured
      if (business.email && this.emailTransporter) {
        await this.sendProposalEmail(business, proposalContent);
        await this.updateProposalStatus(proposalId, 'sent');
      } else {
        // Simulate sending for demo purposes
        await this.simulateProposalSending(proposalId, business);
      }

      logActivity(
        'proposal',
        business.name,
        businessId,
        `Generated and sent proposal to ${business.name}`,
        'success',
        { proposalId, hasEmail: !!business.email }
      );

      updateAgentStatus('proposal', 'active', null, true);
      this.currentTask = null;

      return {
        id: proposalId,
        businessId,
        content: proposalContent,
        status: business.email ? 'sent' : 'generated'
      };
    } catch (error) {
      console.error('Error generating proposal:', error);
      logActivity('proposal', business.name, businessId, `Proposal generation failed: ${error.message}`, 'failed');
      this.currentTask = null;
      throw error;
    }
  }

  async createProposalContent(business) {
    const prompt = `
      Create a compelling business proposal for "${business.name}" located at "${business.address}".
      
      Business Details:
      - Industry: ${business.industry || 'Unknown'}
      - Current Website: ${business.website || 'None'}
      - Digital Presence Score: ${business.digital_presence_score}/100
      - Opportunity Score: ${business.opportunity_score}/100
      - Rating: ${business.rating || 'N/A'} (${business.review_count || 0} reviews)
      
      Create a personalized proposal that:
      1. Addresses their specific digital gaps
      2. Proposes relevant IT services (website, e-commerce, digital marketing, etc.)
      3. Shows potential ROI and business growth
      4. Includes a clear call-to-action
      5. Maintains a professional yet approachable tone
      
      The proposal should be compelling and demonstrate clear value.
    `;

    const response = await this.geminiAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            introduction: { type: Type.STRING },
            problemAnalysis: { type: Type.STRING },
            proposedSolutions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  service: { type: Type.STRING },
                  description: { type: Type.STRING },
                  benefits: { type: Type.STRING },
                  estimatedCost: { type: Type.STRING },
                  timeline: { type: Type.STRING }
                }
              }
            },
            roiProjection: { type: Type.STRING },
            callToAction: { type: Type.STRING },
            nextSteps: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text);
  }

  async saveProposal(businessId, content) {
    const db = getDatabase();
    const proposalId = `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO proposals (id, business_id, content, status) VALUES (?, ?, ?, ?)`,
        [proposalId, businessId, JSON.stringify(content), 'draft'],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(proposalId);
          }
        }
      );
    });
  }

  async sendProposalEmail(business, proposalContent) {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    const emailHtml = this.generateEmailHTML(business, proposalContent);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: business.email,
      subject: proposalContent.subject,
      html: emailHtml
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  generateEmailHTML(business, proposal) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${proposal.subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .solution { background: white; margin: 15px 0; padding: 15px; border-left: 4px solid #4f46e5; }
          .cta { background: #4f46e5; color: white; padding: 15px; text-align: center; margin: 20px 0; }
          .cta a { color: white; text-decoration: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>BizGrow IT Solutions</h1>
            <p>Digital Growth Proposal for ${business.name}</p>
          </div>
          
          <div class="content">
            <h2>Dear ${business.name} Team,</h2>
            <p>${proposal.introduction}</p>
            
            <h3>Current Situation Analysis</h3>
            <p>${proposal.problemAnalysis}</p>
            
            <h3>Proposed Solutions</h3>
            ${proposal.proposedSolutions.map(solution => `
              <div class="solution">
                <h4>${solution.service}</h4>
                <p><strong>Description:</strong> ${solution.description}</p>
                <p><strong>Benefits:</strong> ${solution.benefits}</p>
                <p><strong>Investment:</strong> ${solution.estimatedCost}</p>
                <p><strong>Timeline:</strong> ${solution.timeline}</p>
              </div>
            `).join('')}
            
            <h3>Return on Investment</h3>
            <p>${proposal.roiProjection}</p>
            
            <div class="cta">
              <p>${proposal.callToAction}</p>
              <a href="mailto:${process.env.EMAIL_FROM || process.env.EMAIL_USER}?subject=Re: ${proposal.subject}">
                Reply to Get Started
              </a>
            </div>
            
            <h3>Next Steps</h3>
            <p>${proposal.nextSteps}</p>
            
            <p>Best regards,<br>
            BizGrow IT Solutions Team<br>
            <a href="mailto:${process.env.EMAIL_FROM || process.env.EMAIL_USER}">${process.env.EMAIL_FROM || process.env.EMAIL_USER}</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async simulateProposalSending(proposalId, business) {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Randomly simulate interest responses (for demo purposes)
    const interestProbability = business.opportunity_score / 100 * 0.3; // 30% max based on opportunity score
    const isInterested = Math.random() < interestProbability;
    
    if (isInterested) {
      setTimeout(async () => {
        await this.simulateInterestResponse(proposalId, business);
      }, Math.random() * 300000 + 60000); // Random response between 1-6 minutes
    }
    
    await this.updateProposalStatus(proposalId, 'sent');
  }

  async simulateInterestResponse(proposalId, business) {
    await this.updateProposalStatus(proposalId, 'interested');
    
    logActivity(
      'interest',
      business.name,
      business.id,
      `${business.name} showed interest in the proposal`,
      'success',
      { proposalId, responseType: 'interested' }
    );

    // Update business status to interested
    const db = getDatabase();
    db.run(
      `UPDATE businesses SET status = 'interested' WHERE id = ?`,
      [business.id]
    );
  }

  async updateProposalStatus(proposalId, status) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const updateData = { status };
      
      if (status === 'sent') {
        updateData.sent_at = new Date().toISOString();
      } else if (status === 'interested') {
        updateData.response_at = new Date().toISOString();
        updateData.interest_level = Math.floor(Math.random() * 30) + 70; // 70-100% interest
      }

      const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updateData);
      values.push(proposalId);

      db.run(
        `UPDATE proposals SET ${fields} WHERE id = ?`,
        values,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getBusinessById(businessId) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM businesses WHERE id = ?`,
        [businessId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async runAutomatedProposals() {
    if (!this.isActive) {
      return;
    }

    console.log('Running automated proposal generation...');
    
    try {
      // Get businesses without proposals that have high opportunity scores
      const db = getDatabase();
      const businesses = await new Promise((resolve, reject) => {
        db.all(
          `SELECT b.* FROM businesses b 
           LEFT JOIN proposals p ON b.id = p.business_id 
           WHERE p.id IS NULL AND b.opportunity_score > 60 AND b.status = 'discovered'
           ORDER BY b.opportunity_score DESC 
           LIMIT 3`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      for (const business of businesses) {
        try {
          await this.generateProposal(business.id);
          // Add delay between proposals
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
          console.error(`Failed to generate proposal for ${business.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Automated proposal generation failed:', error);
    }
  }

  async processQueue() {
    if (this.isProcessing || !this.isActive) {
      return;
    }

    this.isProcessing = true;

    while (this.proposalQueue.length > 0 && this.isActive) {
      const task = this.proposalQueue.shift();
      try {
        await this.generateProposal(task.businessId);
      } catch (error) {
        console.error('Error processing proposal queue:', error);
      }
    }

    this.isProcessing = false;
  }

  addToQueue(businessId) {
    this.proposalQueue.push({ businessId });
    
    if (this.isActive && !this.isProcessing) {
      this.processQueue();
    }
  }

  getStatus() {
    return {
      isActive: this.isActive,
      currentTask: this.currentTask,
      queueLength: this.proposalQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

export default ProposalAgent;