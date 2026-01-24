import { initDatabase, getDatabase } from './database/init.js';
import cachedDb from './services/cachedDatabase.js';

const sampleBusinesses = [
  {
    name: 'Joe\'s Pizza Palace',
    address: '123 Main St, New York, NY 10001',
    phone: '(555) 123-4567',
    website: '',
    email: 'info@joespizza.com',
    rating: 4.5,
    review_count: 250,
    region: 'New York',
    industry: 'Restaurant',
    digital_presence_score: 35,
    opportunity_score: 85,
    status: 'discovered'
  },
  {
    name: 'Smith & Sons Plumbing',
    address: '456 Oak Ave, Los Angeles, CA 90001',
    phone: '(555) 234-5678',
    website: 'http://smithplumbing.com',
    email: 'contact@smithplumbing.com',
    rating: 4.8,
    review_count: 180,
    region: 'Los Angeles',
    industry: 'Home Services',
    digital_presence_score: 55,
    opportunity_score: 70,
    status: 'contacted'
  },
  {
    name: 'Downtown Dental Care',
    address: '789 Park Blvd, Chicago, IL 60601',
    phone: '(555) 345-6789',
    website: '',
    email: 'appointments@downtowndental.com',
    rating: 4.2,
    review_count: 95,
    region: 'Chicago',
    industry: 'Healthcare',
    digital_presence_score: 40,
    opportunity_score: 80,
    status: 'discovered'
  },
  {
    name: 'Green Thumb Landscaping',
    address: '321 Garden Way, Miami, FL 33101',
    phone: '(555) 456-7890',
    website: 'http://greenthumblandscaping.com',
    email: 'info@greenthumb.com',
    rating: 4.6,
    review_count: 120,
    region: 'Miami',
    industry: 'Landscaping',
    digital_presence_score: 60,
    opportunity_score: 65,
    status: 'interested'
  },
  {
    name: 'Tech Repair Hub',
    address: '555 Tech Drive, Austin, TX 78701',
    phone: '(555) 567-8901',
    website: '',
    email: 'support@techrepairhub.com',
    rating: 4.3,
    review_count: 200,
    region: 'Austin',
    industry: 'Technology',
    digital_presence_score: 45,
    opportunity_score: 75,
    status: 'discovered'
  }
];

async function seedProposals() {
  try {
    console.log('🌱 Starting proposal seeding...');
    
    // Initialize database
    await initDatabase();
    await cachedDb.init();
    
    console.log('📊 Database initialized');
    
    // Check if businesses already exist
    const existingBusinesses = await cachedDb.all('SELECT COUNT(*) as count FROM businesses');
    
    if (existingBusinesses[0].count > 0) {
      console.log(`✅ Found ${existingBusinesses[0].count} existing businesses`);
    } else {
      console.log('📝 Creating sample businesses...');
      
      // Insert sample businesses
      for (const business of sampleBusinesses) {
        const result = await cachedDb.run(`
          INSERT INTO businesses (
            name, address, phone, website, email, rating, review_count,
            region, industry, digital_presence_score, opportunity_score, 
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
          business.name,
          business.address,
          business.phone,
          business.website,
          business.email,
          business.rating,
          business.review_count,
          business.region,
          business.industry,
          business.digital_presence_score,
          business.opportunity_score,
          business.status
        ]);
        
        console.log(`  ✓ Created business: ${business.name} (ID: ${result.lastID})`);
      }
    }
    
    // Get all businesses
    const businesses = await cachedDb.all('SELECT * FROM businesses LIMIT 10');
    console.log(`\n📋 Found ${businesses.length} businesses`);
    
    // Check existing proposals
    const existingProposals = await cachedDb.all('SELECT COUNT(*) as count FROM proposals');
    console.log(`📄 Found ${existingProposals[0].count} existing proposals`);
    
    // Create proposals for businesses that don't have one
    let proposalsCreated = 0;
    
    for (const business of businesses) {
      // Check if proposal already exists
      const existing = await cachedDb.get(
        'SELECT id FROM proposals WHERE business_id = ?',
        [business.id]
      );
      
      if (!existing) {
        const proposalContent = generateProposalContent(business);
        
        // Determine status based on business status
        let proposalStatus = 'draft';
        if (business.status === 'contacted') proposalStatus = 'sent';
        if (business.status === 'interested') proposalStatus = 'viewed';
        if (business.status === 'converted') proposalStatus = 'accepted';
        
        const result = await cachedDb.run(`
          INSERT INTO proposals (
            business_id, content, status, 
            ${proposalStatus === 'sent' || proposalStatus === 'viewed' || proposalStatus === 'accepted' ? 'sent_at,' : ''}
            created_at, updated_at
          ) VALUES (
            ?, ?, ?,
            ${proposalStatus === 'sent' || proposalStatus === 'viewed' || proposalStatus === 'accepted' ? 'datetime(\'now\', \'-7 days\'),' : ''}
            datetime('now', '-10 days'), datetime('now')
          )
        `, [business.id, proposalContent, proposalStatus]);
        
        console.log(`  ✓ Created proposal for: ${business.name} (Status: ${proposalStatus})`);
        proposalsCreated++;
      }
    }
    
    console.log(`\n✅ Seeding complete!`);
    console.log(`   - Businesses: ${businesses.length}`);
    console.log(`   - New proposals created: ${proposalsCreated}`);
    console.log(`   - Total proposals: ${existingProposals[0].count + proposalsCreated}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding proposals:', error);
    process.exit(1);
  }
}

function generateProposalContent(business) {
  const services = [];
  
  if (!business.website || business.website === '') {
    services.push('Professional Website Development');
  }
  
  if (business.digital_presence_score < 50) {
    services.push('Digital Marketing Strategy');
    services.push('Social Media Management');
  }
  
  if (business.rating && business.rating < 4.0) {
    services.push('Online Reputation Management');
  }
  
  services.push('SEO Optimization');
  services.push('Business Analytics Dashboard');

  return `
# Digital Transformation Proposal for ${business.name}

## Executive Summary

We are pleased to present this comprehensive digital transformation proposal for ${business.name}. Our analysis indicates significant opportunities to enhance your digital presence and drive business growth.

## Current Situation

- **Business Name:** ${business.name}
- **Location:** ${business.address}
- **Industry:** ${business.industry || 'General Business'}
- **Digital Presence Score:** ${business.digital_presence_score || 0}/100
- **Opportunity Score:** ${business.opportunity_score || 0}/100

## Recommended Services

${services.map((service, index) => `${index + 1}. **${service}**`).join('\n')}

## Implementation Timeline

- **Phase 1 (Weeks 1-2):** Discovery and Planning
- **Phase 2 (Weeks 3-6):** Development and Implementation
- **Phase 3 (Weeks 7-8):** Testing and Optimization
- **Phase 4 (Week 9+):** Launch and Ongoing Support

## Investment

We offer flexible pricing packages tailored to your specific needs. Our team will work with you to create a customized solution that fits your budget and delivers maximum ROI.

## Next Steps

1. Schedule a consultation call to discuss your specific needs
2. Review and approve the detailed project plan
3. Begin implementation with our expert team

## Why Choose BizGrow AI?

- **Proven Track Record:** Successfully delivered 100+ digital transformation projects
- **AI-Powered Solutions:** Cutting-edge technology for optimal results
- **Dedicated Support:** 24/7 customer support and ongoing maintenance
- **Results-Driven:** Focus on measurable business outcomes

We look forward to partnering with you to transform your digital presence and drive business growth.

---

**Contact Information:**
BizGrow AI - Digital Transformation Experts
Email: contact@bizgrow.ai
Phone: (555) 123-4567
Website: www.bizgrow.ai
`.trim();
}

// Run the seeding
seedProposals();
