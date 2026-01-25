-- PostgreSQL Schema Migration: Multi-Tenant Architecture
-- Implements tenant data isolation with strict separation and security

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- For encryption functions

-- Tenants table - Core tenant management
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL, -- URL-friendly identifier
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
    
    -- Subscription and limits
    plan_type VARCHAR(50) DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise')),
    max_users INTEGER DEFAULT 5,
    max_businesses INTEGER DEFAULT 100,
    max_proposals INTEGER DEFAULT 50,
    max_storage_mb INTEGER DEFAULT 1000,
    
    -- Usage tracking
    current_users INTEGER DEFAULT 0,
    current_businesses INTEGER DEFAULT 0,
    current_proposals INTEGER DEFAULT 0,
    current_storage_mb DECIMAL(10,2) DEFAULT 0,
    
    -- Billing information
    billing_email VARCHAR(255),
    billing_cycle VARCHAR(20) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
    next_billing_date DATE,
    
    -- Security settings
    encryption_key_id VARCHAR(255), -- Reference to encryption key
    data_retention_days INTEGER DEFAULT 365,
    require_mfa BOOLEAN DEFAULT FALSE,
    allowed_ip_ranges INET[], -- Array of allowed IP ranges
    
    -- Customization
    branding_config JSONB DEFAULT '{}', -- Logo, colors, etc.
    feature_flags JSONB DEFAULT '{}', -- Tenant-specific features
    custom_settings JSONB DEFAULT '{}', -- Additional settings
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    suspended_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Add tenant_id to existing tables for data isolation

-- Users table - Add tenant association
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_role VARCHAR(50) DEFAULT 'member' CHECK (tenant_role IN ('owner', 'admin', 'member', 'viewer'));

-- Businesses table - Add tenant association
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Proposals table - Add tenant association
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Projects table - Add tenant association
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Activity log table - Add tenant association
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Tenant-specific indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_plan_type ON tenants(plan_type);

-- Tenant isolation indexes on existing tables
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_businesses_tenant_id ON businesses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant_id ON proposals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_id ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON activity_log(tenant_id);

-- Composite indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_businesses_tenant_status ON businesses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant_status ON proposals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_status ON projects(tenant_id, status);

-- Tenant audit log for security tracking
CREATE TABLE IF NOT EXISTS tenant_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'create', 'read', 'update', 'delete', 'access_denied'
    resource_type VARCHAR(100) NOT NULL, -- 'business', 'proposal', 'project', 'user'
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant_id ON tenant_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_user_id ON tenant_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_action ON tenant_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_created_at ON tenant_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_audit_severity ON tenant_audit_log(severity);

-- Tenant usage metrics for quota enforcement
CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- 'api_calls', 'storage', 'users', 'businesses'
    metric_value DECIMAL(12,2) NOT NULL,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, metric_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant_id ON tenant_usage_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_metric_type ON tenant_usage_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_period ON tenant_usage_metrics(period_start DESC);

-- Row Level Security (RLS) Policies for strict data isolation
-- Enable RLS on all tenant-aware tables

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access data from their tenant
-- Note: These policies assume a session variable 'app.current_tenant_id' is set

CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_businesses ON businesses
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_proposals ON proposals
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_projects ON projects
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_activity_log ON activity_log
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_audit_log ON tenant_audit_log
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Functions for tenant management and security

-- Function to set current tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current tenant context
CREATE OR REPLACE FUNCTION get_tenant_context()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to validate tenant access
CREATE OR REPLACE FUNCTION validate_tenant_access(p_tenant_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_has_access BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM users 
        WHERE id = p_user_id 
        AND tenant_id = p_tenant_id
        AND tenant_role IN ('owner', 'admin', 'member')
    ) INTO v_has_access;
    
    RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check tenant quota
CREATE OR REPLACE FUNCTION check_tenant_quota(
    p_tenant_id UUID,
    p_quota_type VARCHAR(50)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_value INTEGER;
    v_max_value INTEGER;
BEGIN
    -- Get current and max values based on quota type
    CASE p_quota_type
        WHEN 'users' THEN
            SELECT current_users, max_users INTO v_current_value, v_max_value
            FROM tenants WHERE id = p_tenant_id;
        WHEN 'businesses' THEN
            SELECT current_businesses, max_businesses INTO v_current_value, v_max_value
            FROM tenants WHERE id = p_tenant_id;
        WHEN 'proposals' THEN
            SELECT current_proposals, max_proposals INTO v_current_value, v_max_value
            FROM tenants WHERE id = p_tenant_id;
        ELSE
            RETURN FALSE;
    END CASE;
    
    -- Check if under quota
    RETURN v_current_value < v_max_value;
END;
$$ LANGUAGE plpgsql;

-- Function to update tenant usage
CREATE OR REPLACE FUNCTION update_tenant_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment usage counter
        CASE TG_TABLE_NAME
            WHEN 'users' THEN
                UPDATE tenants SET current_users = current_users + 1 WHERE id = NEW.tenant_id;
            WHEN 'businesses' THEN
                UPDATE tenants SET current_businesses = current_businesses + 1 WHERE id = NEW.tenant_id;
            WHEN 'proposals' THEN
                UPDATE tenants SET current_proposals = current_proposals + 1 WHERE id = NEW.tenant_id;
        END CASE;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement usage counter
        CASE TG_TABLE_NAME
            WHEN 'users' THEN
                UPDATE tenants SET current_users = current_users - 1 WHERE id = OLD.tenant_id;
            WHEN 'businesses' THEN
                UPDATE tenants SET current_businesses = current_businesses - 1 WHERE id = OLD.tenant_id;
            WHEN 'proposals' THEN
                UPDATE tenants SET current_proposals = current_proposals - 1 WHERE id = OLD.tenant_id;
        END CASE;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply usage tracking triggers
CREATE TRIGGER update_tenant_users_usage
    AFTER INSERT OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION update_tenant_usage();

CREATE TRIGGER update_tenant_businesses_usage
    AFTER INSERT OR DELETE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_tenant_usage();

CREATE TRIGGER update_tenant_proposals_usage
    AFTER INSERT OR DELETE ON proposals
    FOR EACH ROW EXECUTE FUNCTION update_tenant_usage();

-- Trigger for tenant audit logging
CREATE OR REPLACE FUNCTION log_tenant_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Log data access for audit trail
    INSERT INTO tenant_audit_log (
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        details
    ) VALUES (
        COALESCE(NEW.tenant_id, OLD.tenant_id),
        current_setting('app.current_user_id', true)::UUID,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        jsonb_build_object(
            'operation', TG_OP,
            'table', TG_TABLE_NAME,
            'timestamp', CURRENT_TIMESTAMP
        )
    );
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
CREATE TRIGGER audit_users_access
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION log_tenant_access();

CREATE TRIGGER audit_businesses_access
    AFTER INSERT OR UPDATE OR DELETE ON businesses
    FOR EACH ROW EXECUTE FUNCTION log_tenant_access();

CREATE TRIGGER audit_proposals_access
    AFTER INSERT OR UPDATE OR DELETE ON proposals
    FOR EACH ROW EXECUTE FUNCTION log_tenant_access();

CREATE TRIGGER audit_projects_access
    AFTER INSERT OR UPDATE OR DELETE ON projects
    FOR EACH ROW EXECUTE FUNCTION log_tenant_access();

-- Update trigger for tenants table
CREATE TRIGGER update_tenants_updated_at 
    BEFORE UPDATE ON tenants 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for tenant management

-- Tenant summary view
CREATE OR REPLACE VIEW tenant_summary AS
SELECT 
    t.id,
    t.name,
    t.slug,
    t.status,
    t.plan_type,
    t.current_users,
    t.max_users,
    t.current_businesses,
    t.max_businesses,
    t.current_proposals,
    t.max_proposals,
    ROUND((t.current_users::DECIMAL / NULLIF(t.max_users, 0)) * 100, 2) as users_usage_percent,
    ROUND((t.current_businesses::DECIMAL / NULLIF(t.max_businesses, 0)) * 100, 2) as businesses_usage_percent,
    ROUND((t.current_proposals::DECIMAL / NULLIF(t.max_proposals, 0)) * 100, 2) as proposals_usage_percent,
    t.created_at,
    t.trial_ends_at,
    t.next_billing_date
FROM tenants t;

-- Tenant activity view
CREATE OR REPLACE VIEW tenant_activity_summary AS
SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    COUNT(DISTINCT u.id) as total_users,
    COUNT(DISTINCT b.id) as total_businesses,
    COUNT(DISTINCT p.id) as total_proposals,
    COUNT(DISTINCT pr.id) as total_projects,
    COALESCE(SUM(pr.revenue), 0) as total_revenue,
    MAX(al.created_at) as last_activity
FROM tenants t
LEFT JOIN users u ON t.id = u.tenant_id
LEFT JOIN businesses b ON t.id = b.tenant_id
LEFT JOIN proposals p ON t.id = p.tenant_id
LEFT JOIN projects pr ON t.id = pr.tenant_id
LEFT JOIN activity_log al ON t.id = al.tenant_id
GROUP BY t.id, t.name;

-- Comments for documentation
COMMENT ON TABLE tenants IS 'Multi-tenant architecture: Core tenant management with quotas and security';
COMMENT ON TABLE tenant_audit_log IS 'Security audit trail for tenant data access and modifications';
COMMENT ON TABLE tenant_usage_metrics IS 'Tenant usage tracking for quota enforcement and billing';

COMMENT ON COLUMN tenants.encryption_key_id IS 'Reference to tenant-specific encryption key for data-at-rest encryption';
COMMENT ON COLUMN tenants.allowed_ip_ranges IS 'Array of allowed IP ranges for tenant access control';
COMMENT ON COLUMN tenants.feature_flags IS 'Tenant-specific feature toggles and configuration';

-- Security notes
COMMENT ON POLICY tenant_isolation_users ON users IS 'Row-level security: Users can only access data from their tenant';
COMMENT ON FUNCTION set_tenant_context IS 'Sets the current tenant context for RLS policies';
COMMENT ON FUNCTION validate_tenant_access IS 'Validates if a user has access to a specific tenant';
COMMENT ON FUNCTION check_tenant_quota IS 'Checks if tenant is within quota limits before allowing operations';
