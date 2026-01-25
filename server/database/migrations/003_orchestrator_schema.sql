-- Migration: Orchestrator Schema
-- Description: Create tables for agent orchestrator task management
-- Version: 003
-- Date: 2026-01-25

-- Forward Migration (PostgreSQL)
-- ==================

-- Orchestrator tasks table
CREATE TABLE IF NOT EXISTS orchestrator_tasks (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(100) UNIQUE NOT NULL,
  agent_name VARCHAR(50) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  task_data JSONB,
  priority INTEGER DEFAULT 2,
  status VARCHAR(20) NOT NULL,
  submitted_at TIMESTAMP NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  error TEXT,
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_task_id ON orchestrator_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_agent ON orchestrator_tasks(agent_name);
CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_status ON orchestrator_tasks(status);
CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_submitted ON orchestrator_tasks(submitted_at);

-- Agent health log table
CREATE TABLE IF NOT EXISTS agent_health_log (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(50) NOT NULL,
  health_status VARCHAR(20) NOT NULL,
  metrics JSONB,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_health_log_agent ON agent_health_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_health_log_checked ON agent_health_log(checked_at);

-- Resource allocation log table
CREATE TABLE IF NOT EXISTS resource_allocation_log (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  allocated_amount INTEGER,
  allocation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  released_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resource_allocation_agent ON resource_allocation_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_resource_allocation_time ON resource_allocation_log(allocation_time);

-- Rollback Migration
-- ==================

-- DROP INDEX IF EXISTS idx_resource_allocation_time;
-- DROP INDEX IF EXISTS idx_resource_allocation_agent;
-- DROP TABLE IF EXISTS resource_allocation_log;
-- DROP INDEX IF EXISTS idx_agent_health_log_checked;
-- DROP INDEX IF EXISTS idx_agent_health_log_agent;
-- DROP TABLE IF EXISTS agent_health_log;
-- DROP INDEX IF EXISTS idx_orchestrator_tasks_submitted;
-- DROP INDEX IF EXISTS idx_orchestrator_tasks_status;
-- DROP INDEX IF EXISTS idx_orchestrator_tasks_agent;
-- DROP INDEX IF EXISTS idx_orchestrator_tasks_task_id;
-- DROP TABLE IF EXISTS orchestrator_tasks;
