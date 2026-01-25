-- Migration: Analytics Schema
-- Description: Create tables for business metrics and analytics tracking
-- Version: 002
-- Date: 2026-01-25

-- Forward Migration (PostgreSQL)
-- ==================

-- Business events table
CREATE TABLE IF NOT EXISTS business_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  event_data JSONB,
  user_id INTEGER,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_business_events_type ON business_events(event_type);
CREATE INDEX IF NOT EXISTS idx_business_events_user ON business_events(user_id);
CREATE INDEX IF NOT EXISTS idx_business_events_created ON business_events(created_at);

-- Analytics metrics table
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  metric_date DATE NOT NULL,
  metric_value DECIMAL(15, 2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (metric_name, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_metrics_name ON analytics_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_date ON analytics_metrics(metric_date);

-- User behavior tracking table
CREATE TABLE IF NOT EXISTS user_behavior (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  action VARCHAR(100) NOT NULL,
  action_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_behavior_user ON user_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_action ON user_behavior(action);
CREATE INDEX IF NOT EXISTS idx_user_behavior_created ON user_behavior(created_at);

-- System usage tracking table
CREATE TABLE IF NOT EXISTS system_usage (
  id SERIAL PRIMARY KEY,
  usage_type VARCHAR(100) NOT NULL,
  usage_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_usage_type ON system_usage(usage_type);
CREATE INDEX IF NOT EXISTS idx_system_usage_created ON system_usage(created_at);

-- Anomaly detection log table
CREATE TABLE IF NOT EXISTS anomaly_log (
  id SERIAL PRIMARY KEY,
  anomaly_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT,
  current_value DECIMAL(15, 2),
  previous_value DECIMAL(15, 2),
  change_percentage DECIMAL(5, 2),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_anomaly_log_type ON anomaly_log(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_anomaly_log_severity ON anomaly_log(severity);
CREATE INDEX IF NOT EXISTS idx_anomaly_log_detected ON anomaly_log(detected_at);

-- Predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  metric_name VARCHAR(100) NOT NULL,
  prediction_date DATE NOT NULL,
  predicted_value DECIMAL(15, 2),
  confidence DECIMAL(3, 2),
  trend VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_predictions_metric ON predictions(metric_name);
CREATE INDEX IF NOT EXISTS idx_predictions_date ON predictions(prediction_date);

-- Rollback Migration
-- ==================

-- DROP INDEX IF EXISTS idx_predictions_date;
-- DROP INDEX IF EXISTS idx_predictions_metric;
-- DROP TABLE IF EXISTS predictions;
-- DROP INDEX IF EXISTS idx_anomaly_log_detected;
-- DROP INDEX IF EXISTS idx_anomaly_log_severity;
-- DROP INDEX IF EXISTS idx_anomaly_log_type;
-- DROP TABLE IF EXISTS anomaly_log;
-- DROP INDEX IF EXISTS idx_system_usage_created;
-- DROP INDEX IF EXISTS idx_system_usage_type;
-- DROP TABLE IF EXISTS system_usage;
-- DROP INDEX IF EXISTS idx_user_behavior_created;
-- DROP INDEX IF EXISTS idx_user_behavior_action;
-- DROP INDEX IF EXISTS idx_user_behavior_user;
-- DROP TABLE IF EXISTS user_behavior;
-- DROP INDEX IF EXISTS idx_analytics_metrics_date;
-- DROP INDEX IF EXISTS idx_analytics_metrics_name;
-- DROP TABLE IF EXISTS analytics_metrics;
-- DROP INDEX IF EXISTS idx_business_events_created;
-- DROP INDEX IF EXISTS idx_business_events_user;
-- DROP INDEX IF EXISTS idx_business_events_type;
-- DROP TABLE IF EXISTS business_events;
