-- PostgreSQL Schema Migration: Initial Schema
-- Migrates from SQLite to PostgreSQL with performance optimizations

-- Enable UUID extension for better primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table with enhanced security and indexing
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'developer', 'admin')),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Businesses table with enhanced indexing for search performance
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50),
    website VARCHAR(500),
    email VARCHAR(255),
    rating DECIMAL(3,2),
    review_count INTEGER,
    maps_url TEXT,
    region VARCHAR(100),
    industry VARCHAR(100),
    digital_presence_score INTEGER DEFAULT 0 CHECK (digital_presence_score >= 0 AND digital_presence_score <= 100),
    opportunity_score INTEGER DEFAULT 0 CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
    status VARCHAR(50) DEFAULT 'discovered' CHECK (status IN ('discovered', 'contacted', 'interested', 'converted', 'rejected')),
    coordinates POINT, -- PostgreSQL geometric type for location data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Proposals table with foreign key constraints
CREATE TABLE IF NOT EXISTS proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'interested', 'rejected', 'accepted')),
    sent_at TIMESTAMP WITH TIME ZONE,
    response_at TIMESTAMP WITH TIME ZONE,
    interest_level INTEGER DEFAULT 0 CHECK (interest_level >= 0 AND interest_level <= 10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Projects table with enhanced tracking
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
    project_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'on_hold')),
    build_progress INTEGER DEFAULT 0 CHECK (build_progress >= 0 AND build_progress <= 100),
    deployment_url VARCHAR(500),
    estimated_completion TIMESTAMP WITH TIME ZONE,
    actual_completion TIMESTAMP WITH TIME ZONE,
    revenue DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Activity log table with JSON metadata support
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(100) NOT NULL,
    business_name VARCHAR(255),
    business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'error', 'warning', 'info')),
    metadata JSONB, -- PostgreSQL JSON with indexing support
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET, -- PostgreSQL network address type
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Agent status table with performance metrics
CREATE TABLE IF NOT EXISTS agent_status (
    agent_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'idle' CHECK (status IN ('idle', 'active', 'busy', 'error', 'maintenance')),
    current_task TEXT,
    tasks_completed INTEGER DEFAULT 0,
    tasks_failed INTEGER DEFAULT 0,
    performance_score INTEGER DEFAULT 100 CHECK (performance_score >= 0 AND performance_score <= 100),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    health_check_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_count INTEGER DEFAULT 0,
    avg_task_duration INTERVAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Regional analytics table with time-series optimization
CREATE TABLE IF NOT EXISTS regional_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region VARCHAR(100) NOT NULL,
    businesses_discovered INTEGER DEFAULT 0,
    proposals_sent INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,4) DEFAULT 0 CHECK (conversion_rate >= 0 AND conversion_rate <= 1),
    revenue DECIMAL(12,2) DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(region, date) -- Prevent duplicate entries for same region/date
);

-- Performance indexes for optimal query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

-- Businesses table indexes (critical for search performance)
CREATE INDEX IF NOT EXISTS idx_businesses_region ON businesses(region);
CREATE INDEX IF NOT EXISTS idx_businesses_industry ON businesses(industry);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_businesses_opportunity_score ON businesses(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_digital_presence ON businesses(digital_presence_score DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_created_at ON businesses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_name_search ON businesses USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_businesses_address_search ON businesses USING gin(to_tsvector('english', address));
CREATE INDEX IF NOT EXISTS idx_businesses_coordinates ON businesses USING gist(coordinates); -- Spatial index

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_businesses_region_status ON businesses(region, status);
CREATE INDEX IF NOT EXISTS idx_businesses_industry_score ON businesses(industry, opportunity_score DESC);

-- Proposals table indexes
CREATE INDEX IF NOT EXISTS idx_proposals_business_id ON proposals(business_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_sent_at ON proposals(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_business_status ON proposals(business_id, status);

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_business_id ON projects(business_id);
CREATE INDEX IF NOT EXISTS idx_projects_proposal_id ON projects(proposal_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_completion ON projects(actual_completion DESC);
CREATE INDEX IF NOT EXISTS idx_projects_revenue ON projects(revenue DESC);

-- Activity log indexes (for monitoring and analytics)
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);
CREATE INDEX IF NOT EXISTS idx_activity_log_business_id ON activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_status ON activity_log(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_metadata ON activity_log USING gin(metadata); -- JSON index

-- Agent status indexes
CREATE INDEX IF NOT EXISTS idx_agent_status_status ON agent_status(status);
CREATE INDEX IF NOT EXISTS idx_agent_status_last_active ON agent_status(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_agent_status_performance ON agent_status(performance_score DESC);

-- Regional analytics indexes (time-series optimization)
CREATE INDEX IF NOT EXISTS idx_regional_analytics_region ON regional_analytics(region);
CREATE INDEX IF NOT EXISTS idx_regional_analytics_date ON regional_analytics(date DESC);
CREATE INDEX IF NOT EXISTS idx_regional_analytics_region_date ON regional_analytics(region, date DESC);

-- Triggers for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_status_updated_at BEFORE UPDATE ON agent_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries (performance optimization)

-- Business summary view with calculated metrics
CREATE OR REPLACE VIEW business_summary AS
SELECT 
    b.id,
    b.name,
    b.region,
    b.industry,
    b.status,
    b.opportunity_score,
    b.digital_presence_score,
    COUNT(p.id) as proposal_count,
    COUNT(pr.id) as project_count,
    COALESCE(SUM(pr.revenue), 0) as total_revenue,
    b.created_at,
    b.updated_at
FROM businesses b
LEFT JOIN proposals p ON b.id = p.business_id
LEFT JOIN projects pr ON b.id = pr.business_id
GROUP BY b.id, b.name, b.region, b.industry, b.status, b.opportunity_score, b.digital_presence_score, b.created_at, b.updated_at;

-- Agent performance view
CREATE OR REPLACE VIEW agent_performance AS
SELECT 
    agent_id,
    name,
    status,
    tasks_completed,
    tasks_failed,
    CASE 
        WHEN tasks_completed + tasks_failed > 0 
        THEN ROUND((tasks_completed::DECIMAL / (tasks_completed + tasks_failed)) * 100, 2)
        ELSE 0 
    END as success_rate,
    performance_score,
    error_count,
    avg_task_duration,
    last_active,
    health_check_at
FROM agent_status;

-- Regional performance view
CREATE OR REPLACE VIEW regional_performance AS
SELECT 
    region,
    SUM(businesses_discovered) as total_discovered,
    SUM(proposals_sent) as total_proposals,
    AVG(conversion_rate) as avg_conversion_rate,
    SUM(revenue) as total_revenue,
    COUNT(*) as days_tracked,
    MAX(date) as last_update
FROM regional_analytics
GROUP BY region;

-- Comments for documentation
COMMENT ON TABLE users IS 'User accounts with role-based access control and security features';
COMMENT ON TABLE businesses IS 'Business entities discovered by AI agents with scoring and location data';
COMMENT ON TABLE proposals IS 'Generated proposals sent to businesses with tracking';
COMMENT ON TABLE projects IS 'Development projects for interested businesses';
COMMENT ON TABLE activity_log IS 'System activity log with JSON metadata support';
COMMENT ON TABLE agent_status IS 'AI agent status and performance monitoring';
COMMENT ON TABLE regional_analytics IS 'Time-series analytics data by region';

COMMENT ON COLUMN businesses.coordinates IS 'Geographic coordinates as PostgreSQL POINT type for spatial queries';
COMMENT ON COLUMN activity_log.metadata IS 'JSON metadata with GIN index for flexible querying';
COMMENT ON COLUMN activity_log.ip_address IS 'Client IP address using PostgreSQL INET type';

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bizgrow_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bizgrow_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bizgrow_user;