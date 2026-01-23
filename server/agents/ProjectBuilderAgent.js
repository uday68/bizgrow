import { GoogleGenAI, Type } from '@google/genai';
import { getDatabase, logActivity, updateAgentStatus } from '../database/init.js';
import { promises as fs } from 'fs';
import path from 'path';

class ProjectBuilderAgent {
  constructor() {
    this.isActive = true;
    this.currentTask = null;
    
    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY environment variable is not set');
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    this.geminiAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    this.buildQueue = [];
    this.isProcessing = false;
    this.projectsDir = path.join(process.cwd(), 'generated-projects');
    this.ensureProjectsDirectory();
  }

  async ensureProjectsDirectory() {
    try {
      await fs.mkdir(this.projectsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating projects directory:', error);
    }
  }

  toggle() {
    this.isActive = !this.isActive;
    updateAgentStatus('builder', this.isActive ? 'active' : 'idle');
    
    if (this.isActive && this.buildQueue.length > 0) {
      this.processQueue();
    }
  }

  async buildProject(businessId, projectType = 'website') {
    if (!this.isActive) {
      console.log('Project builder agent is inactive');
      return null;
    }

    const business = await this.getBusinessById(businessId);
    if (!business) {
      throw new Error('Business not found');
    }

    this.currentTask = `Building ${projectType} for ${business.name}`;
    updateAgentStatus('builder', 'active', this.currentTask);

    try {
      const projectId = await this.createProject(businessId, projectType);
      const projectSpec = await this.generateProjectSpecification(business, projectType);
      const projectFiles = await this.generateProjectFiles(business, projectType, projectSpec);
      
      await this.saveProjectFiles(projectId, projectFiles);
      await this.updateProjectProgress(projectId, 50);
      
      // Simulate deployment process
      const deploymentUrl = await this.simulateDeployment(projectId, business);
      await this.updateProjectProgress(projectId, 100);
      await this.completeProject(projectId, deploymentUrl);

      logActivity(
        'build',
        business.name,
        businessId,
        `Successfully built ${projectType} for ${business.name}`,
        'success',
        { projectId, projectType, deploymentUrl }
      );

      updateAgentStatus('builder', 'active', null, true);
      this.currentTask = null;

      return {
        id: projectId,
        businessId,
        projectType,
        deploymentUrl,
        status: 'completed'
      };
    } catch (error) {
      console.error('Error building project:', error);
      logActivity('build', business.name, businessId, `Project build failed: ${error.message}`, 'failed');
      this.currentTask = null;
      throw error;
    }
  }

  async generateProjectSpecification(business, projectType) {
    const prompt = `
      Create a detailed project specification for a ${projectType} for "${business.name}".
      
      Business Details:
      - Name: ${business.name}
      - Address: ${business.address}
      - Industry: ${business.industry || 'Unknown'}
      - Current Website: ${business.website || 'None'}
      - Phone: ${business.phone || 'Not provided'}
      
      Generate a comprehensive specification including:
      1. Project overview and objectives
      2. Target audience and user personas
      3. Key features and functionality
      4. Design requirements and branding guidelines
      5. Technical requirements
      6. Content structure and pages needed
      7. SEO and marketing considerations
      
      Make it specific to their business type and local market.
    `;

    const response = await this.geminiAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectOverview: { type: Type.STRING },
            targetAudience: { type: Type.STRING },
            keyFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            designGuidelines: {
              type: Type.OBJECT,
              properties: {
                colorScheme: { type: Type.STRING },
                typography: { type: Type.STRING },
                style: { type: Type.STRING }
              }
            },
            technicalRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            contentStructure: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  page: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  content: { type: Type.STRING }
                }
              }
            },
            seoStrategy: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text);
  }

  async generateProjectFiles(business, projectType, spec) {
    const files = {};

    if (projectType === 'website') {
      // Generate HTML files
      files['index.html'] = await this.generateHTML(business, spec, 'home');
      files['about.html'] = await this.generateHTML(business, spec, 'about');
      files['contact.html'] = await this.generateHTML(business, spec, 'contact');
      files['services.html'] = await this.generateHTML(business, spec, 'services');
      
      // Generate CSS
      files['styles.css'] = await this.generateCSS(business, spec);
      
      // Generate JavaScript
      files['script.js'] = await this.generateJavaScript(business, spec);
      
      // Generate README
      files['README.md'] = this.generateReadme(business, spec);
    }

    return files;
  }

  async generateHTML(business, spec, pageType) {
    const prompt = `
      Generate a complete HTML page for the ${pageType} page of ${business.name}'s website.
      
      Business: ${business.name}
      Industry: ${business.industry}
      Address: ${business.address}
      Phone: ${business.phone}
      
      Design Guidelines: ${JSON.stringify(spec.designGuidelines)}
      Key Features: ${spec.keyFeatures.join(', ')}
      
      Create a modern, responsive HTML page with:
      - Semantic HTML5 structure
      - Mobile-first responsive design
      - Accessibility features
      - SEO-optimized content
      - Professional appearance suitable for ${business.industry}
      - Contact information and call-to-action elements
      
      Include inline CSS for styling and make it look professional.
    `;

    const response = await this.geminiAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt
    });

    return response.text;
  }

  async generateCSS(business, spec) {
    const prompt = `
      Generate a complete CSS stylesheet for ${business.name}'s website.
      
      Design Guidelines:
      - Color Scheme: ${spec.designGuidelines.colorScheme}
      - Typography: ${spec.designGuidelines.typography}
      - Style: ${spec.designGuidelines.style}
      
      Create CSS that includes:
      - Modern, responsive design
      - Mobile-first approach
      - Professional color scheme
      - Typography that matches the business type
      - Smooth animations and transitions
      - Grid/flexbox layouts
      - Accessibility considerations
    `;

    const response = await this.geminiAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt
    });

    return response.text;
  }

  async generateJavaScript(business, spec) {
    const prompt = `
      Generate JavaScript code for ${business.name}'s website.
      
      Include functionality for:
      - Mobile menu toggle
      - Smooth scrolling navigation
      - Contact form validation
      - Image lazy loading
      - Basic analytics tracking
      - Interactive elements
      
      Make it modern, efficient, and accessible.
    `;

    const response = await this.geminiAI.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt
    });

    return response.text;
  }

  generateReadme(business, spec) {
    return `# ${business.name} Website

## Project Overview
${spec.projectOverview}

## Features
${spec.keyFeatures.map(feature => `- ${feature}`).join('\n')}

## Technical Details
- Responsive HTML5/CSS3 website
- Mobile-first design approach
- SEO optimized
- Accessibility compliant

## Business Information
- **Name:** ${business.name}
- **Industry:** ${business.industry}
- **Location:** ${business.address}
- **Phone:** ${business.phone}

## Deployment
This website is ready for deployment to any web hosting service.

## Generated by BizGrow AI
This project was automatically generated by BizGrow AI's Project Builder Agent.
Generated on: ${new Date().toISOString()}
`;
  }

  async saveProjectFiles(projectId, files) {
    const projectDir = path.join(this.projectsDir, projectId);
    await fs.mkdir(projectDir, { recursive: true });

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(projectDir, filename);
      await fs.writeFile(filePath, content, 'utf8');
    }
  }

  async simulateDeployment(projectId, business) {
    // Simulate deployment process
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate a demo URL (in real implementation, this would deploy to actual hosting)
    const subdomain = business.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const deploymentUrl = `https://${subdomain}-demo.bizgrow-ai.com`;
    
    return deploymentUrl;
  }

  async createProject(businessId, projectType) {
    const db = getDatabase();
    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const estimatedCompletion = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO projects (id, business_id, project_type, status, estimated_completion) 
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, businessId, projectType, 'in_progress', estimatedCompletion.toISOString()],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(projectId);
          }
        }
      );
    });
  }

  async updateProjectProgress(projectId, progress) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET build_progress = ? WHERE id = ?`,
        [progress, projectId],
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

  async completeProject(projectId, deploymentUrl) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE projects SET status = ?, deployment_url = ?, actual_completion = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        ['completed', deploymentUrl, projectId],
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

  async runAutomatedBuilding() {
    if (!this.isActive) {
      return;
    }

    console.log('Running automated project building...');
    
    try {
      // Get businesses that showed interest but don't have projects yet
      const db = getDatabase();
      const interestedBusinesses = await new Promise((resolve, reject) => {
        db.all(
          `SELECT b.* FROM businesses b 
           INNER JOIN proposals p ON b.id = p.business_id 
           LEFT JOIN projects pr ON b.id = pr.business_id 
           WHERE p.status = 'interested' AND pr.id IS NULL AND b.status = 'interested'
           ORDER BY p.response_at DESC 
           LIMIT 2`,
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });

      for (const business of interestedBusinesses) {
        try {
          await this.buildProject(business.id, 'website');
          // Add delay between builds
          await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
          console.error(`Failed to build project for ${business.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Automated project building failed:', error);
    }
  }

  async processQueue() {
    if (this.isProcessing || !this.isActive) {
      return;
    }

    this.isProcessing = true;

    while (this.buildQueue.length > 0 && this.isActive) {
      const task = this.buildQueue.shift();
      try {
        await this.buildProject(task.businessId, task.projectType);
      } catch (error) {
        console.error('Error processing build queue:', error);
      }
    }

    this.isProcessing = false;
  }

  addToQueue(businessId, projectType = 'website') {
    this.buildQueue.push({ businessId, projectType });
    
    if (this.isActive && !this.isProcessing) {
      this.processQueue();
    }
  }

  getStatus() {
    return {
      isActive: this.isActive,
      currentTask: this.currentTask,
      queueLength: this.buildQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

export default ProjectBuilderAgent;