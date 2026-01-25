# Agent Capacity Management System

## Overview

The Agent Capacity Management System provides comprehensive capacity management, request queuing, dynamic resource allocation, performance tracking, and auto-scaling for AI agents in the BizGrow AI platform.

## Features

### 1. Capacity Management
- **Dynamic Capacity Allocation**: Agents can handle multiple concurrent requests up to their capacity limit
- **Request Queuing**: Requests exceeding capacity are automatically queued with priority-based processing
- **Load Tracking**: Real-time monitoring of agent load and utilization
- **Capacity Limits**: Configurable minimum and maximum capacity per agent

### 2. Request Queuing
- **Priority-Based Queue**: Requests are processed based on priority (low, normal, high, critical)
- **Automatic Processing**: Queue is processed automatically when capacity becomes available
- **Queue Size Limits**: Maximum queue size prevents memory overflow
- **Wait Time Estimation**: Provides estimated wait time for queued requests

### 3. Dynamic Resource Allocation
- **Resource Pools**: CPU, memory, and network resources are tracked and allocated
- **Agent-Specific Allocation**: Each agent receives dedicated resource allocation
- **Resource Monitoring**: Real-time tracking of allocated vs available resources
- **Resource Release**: Automatic resource cleanup when agents are unregistered

### 4. Auto-Scaling
- **Scale Up**: Automatically increases capacity when load exceeds 80% threshold
- **Scale Down**: Automatically decreases capacity when load drops below 30% threshold
- **Configurable Limits**: Min/max capacity limits prevent over/under-scaling
- **Scaling History**: All scaling events are logged to database for analysis

### 5. Performance Tracking
- **Response Time Metrics**: Tracks average response time per agent
- **Success Rate Monitoring**: Monitors request success/failure rates
- **Load History**: Maintains historical load data for trend analysis
- **Performance Metrics**: Detailed metrics for capacity planning

## Architecture

### Components

1. **AgentCapacityManager** (`server/services/agentCapacityManager.js`)
   - Core capacity management service
   - Handles agent registration, capacity allocation, and scaling
   - Manages request queue and resource pools

2. **Capacity Routes** (`server/routes/capacity.js`)
   - REST API endpoints for capacity management
   - Provides metrics, status, and control endpoints

3. **Integration with Orchestrator**
   - Works alongside the agent orchestrator for task distribution
   - Ensures capacity limits are respected during task execution

4. **Integration with Health Monitor**
   - Coordinates with health monitoring for optimal performance
   - Uses health data to inform scaling decisions

## Configuration

### Default Configuration

```javascript
{
  defaultCapacity: 10,           // Default capacity per agent
  maxQueueSize: 500,             // Maximum queued requests
  queueProcessingInterval: 1000, // Queue check interval (ms)
  autoScalingEnabled: true,      // Enable auto-scaling
  scaleUpThreshold: 0.8,         // Scale up at 80% load
  scaleDownThreshold: 0.3,       // Scale down at 30% load
  minCapacity: 5,                // Minimum capacity
  maxCapacity: 50                // Maximum capacity
}
```

### Agent-Specific Configuration

Each agent can be registered with custom configuration:

```javascript
agentCapacityManager.registerAgent('discovery', {
  capacity: 10,          // Initial capacity
  cpu: 15,              // CPU allocation
  memory: 15,           // Memory allocation
  network: 10,          // Network allocation
  autoScaling: true,    // Enable auto-scaling
  minCapacity: 5,       // Minimum capacity
  maxCapacity: 30       // Maximum capacity
});
```

## API Endpoints

### Metrics and Status

#### GET `/api/capacity/metrics`
Get overall capacity manager metrics including all agents, queue status, and resource pools.

**Response:**
```json
{
  "success": true,
  "metrics": {
    "totalAgents": 3,
    "queueLength": 5,
    "isProcessingQueue": true,
    "resourcePools": {
      "cpu": { "total": 100, "allocated": 65 },
      "memory": { "total": 100, "allocated": 65 },
      "network": { "total": 100, "allocated": 35 }
    },
    "capacityConfig": { ... },
    "agents": { ... }
  }
}
```

#### GET `/api/capacity/agent/:agentName`
Get capacity status for a specific agent.

**Response:**
```json
{
  "success": true,
  "capacity": {
    "agentName": "discovery",
    "capacity": 10,
    "currentLoad": 0.6,
    "averageLoad": 0.55,
    "activeRequests": 6,
    "queuedRequests": 2,
    "totalProcessed": 150,
    "totalRejected": 3,
    "resourceAllocation": {
      "cpu": 15,
      "memory": 15,
      "network": 10
    },
    "performance": {
      "averageResponseTime": 2500,
      "successRate": 98.5
    }
  }
}
```

#### GET `/api/capacity/agents`
Get capacity status for all registered agents.

### Agent Management

#### POST `/api/capacity/agent/register`
Register a new agent with the capacity manager.

**Request Body:**
```json
{
  "agentName": "discovery",
  "config": {
    "capacity": 10,
    "cpu": 15,
    "memory": 15,
    "network": 10,
    "autoScaling": true,
    "minCapacity": 5,
    "maxCapacity": 30
  }
}
```

#### POST `/api/capacity/agent/unregister`
Unregister an agent from the capacity manager.

**Request Body:**
```json
{
  "agentName": "discovery"
}
```

### Capacity Operations

#### POST `/api/capacity/request`
Request capacity for an agent operation.

**Request Body:**
```json
{
  "agentName": "discovery",
  "requestData": { ... },
  "priority": "normal"
}
```

**Response (Immediate):**
```json
{
  "success": true,
  "result": {
    "status": "allocated",
    "requestId": "req_1234567890_abc123",
    "agentName": "discovery"
  }
}
```

**Response (Queued):**
```json
{
  "success": true,
  "result": {
    "status": "queued",
    "requestId": "req_1234567890_abc123",
    "queuePosition": 3,
    "estimatedWaitTime": 7500
  }
}
```

#### POST `/api/capacity/release`
Release capacity after operation completion.

**Request Body:**
```json
{
  "agentName": "discovery",
  "requestId": "req_1234567890_abc123",
  "success": true,
  "metrics": {
    "responseTime": 2500
  }
}
```

### Scaling Operations

#### POST `/api/capacity/agent/:agentName/capacity`
Manually set agent capacity.

**Request Body:**
```json
{
  "capacity": 15
}
```

#### POST `/api/capacity/agent/:agentName/scale-up`
Manually trigger scale up for an agent.

#### POST `/api/capacity/agent/:agentName/scale-down`
Manually trigger scale down for an agent.

### Configuration

#### POST `/api/capacity/config`
Update capacity manager configuration.

**Request Body:**
```json
{
  "maxQueueSize": 1000,
  "autoScalingEnabled": true,
  "scaleUpThreshold": 0.85,
  "scaleDownThreshold": 0.25
}
```

### History and Analytics

#### GET `/api/capacity/agent/:agentName/scaling-history`
Get scaling history for an agent.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 100)

#### GET `/api/capacity/queue`
Get current queue status.

#### GET `/api/capacity/resources`
Get resource pool status.

## Usage Examples

### Basic Usage

```javascript
// Request capacity for an operation
const result = await agentCapacityManager.requestCapacity(
  'discovery',
  { query: 'restaurants', region: 'Seattle' },
  'high'
);

if (result.status === 'allocated') {
  // Perform operation
  const data = await performOperation();
  
  // Release capacity
  await agentCapacityManager.releaseCapacity(
    'discovery',
    result.requestId,
    true,
    { responseTime: 2500 }
  );
} else if (result.status === 'queued') {
  // Request is queued, will be processed automatically
  console.log(`Queued at position ${result.queuePosition}`);
  console.log(`Estimated wait: ${result.estimatedWaitTime}ms`);
}
```

### Monitoring Capacity

```javascript
// Get agent capacity status
const capacity = agentCapacityManager.getAgentCapacity('discovery');
console.log(`Current load: ${(capacity.currentLoad * 100).toFixed(1)}%`);
console.log(`Active requests: ${capacity.activeRequests}/${capacity.capacity}`);
console.log(`Queued requests: ${capacity.queuedRequests}`);

// Get overall metrics
const metrics = agentCapacityManager.getMetrics();
console.log(`Total queue length: ${metrics.queueLength}`);
console.log(`Resource utilization:`, metrics.resourcePools);
```

### Manual Scaling

```javascript
// Manually scale up an agent
await agentCapacityManager.scaleUp('discovery');

// Manually scale down an agent
await agentCapacityManager.scaleDown('discovery');

// Set specific capacity
agentCapacityManager.setAgentCapacity('discovery', 20);
```

## Auto-Scaling Behavior

### Scale Up Triggers
- Current load exceeds 80% (configurable)
- Agent has not reached maximum capacity
- Capacity increases by 50% (rounded up)
- Example: 10 → 15 → 23 → 35 (capped at max)

### Scale Down Triggers
- Current load drops below 30% (configurable)
- Agent has not reached minimum capacity
- No active requests exceed minimum capacity
- Capacity decreases by 25% (rounded down)
- Example: 30 → 23 → 17 → 13 (capped at min)

### Scaling Cooldown
- Scaling events are logged with timestamps
- Prevents rapid scaling oscillations
- Scaling history available for analysis

## Performance Considerations

### Queue Processing
- Queue is processed every 1 second (configurable)
- Processes multiple requests per cycle if capacity available
- Automatically stops when queue is empty
- Restarts automatically when new requests arrive

### Resource Allocation
- Resources are allocated when agents register
- Resources are released when agents unregister
- Prevents over-allocation of system resources
- Tracks CPU, memory, and network separately

### Metrics Collection
- Maintains last 1000 performance metrics per agent
- Maintains last 1000 load history entries per agent
- Automatic cleanup prevents memory growth
- Metrics used for wait time estimation

## Integration with Other Systems

### Orchestrator Integration
The capacity manager works alongside the orchestrator:
- Orchestrator handles task distribution and execution
- Capacity manager ensures capacity limits are respected
- Both systems coordinate for optimal performance

### Health Monitor Integration
The capacity manager coordinates with health monitoring:
- Health status affects capacity allocation decisions
- Unhealthy agents may have reduced capacity
- Performance metrics inform scaling decisions

### Error Handler Integration
The capacity manager works with error handling:
- Failed requests are tracked in metrics
- Capacity is released even on errors
- Error rates inform scaling decisions

## Database Schema

### resource_allocation_log Table
Stores scaling events and resource allocation history.

```sql
CREATE TABLE resource_allocation_log (
  id SERIAL PRIMARY KEY,
  agent_name VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Monitoring and Alerts

### Key Metrics to Monitor
- Queue length (alert if > 80% of max)
- Agent load (alert if consistently > 90%)
- Resource utilization (alert if > 90%)
- Request rejection rate (alert if > 5%)
- Average wait time (alert if > 30 seconds)

### Recommended Alerts
1. **Queue Full**: Queue length approaching maximum
2. **High Load**: Agent load consistently above 90%
3. **Resource Exhaustion**: Resource pools nearly depleted
4. **High Rejection Rate**: Many requests being rejected
5. **Scaling Failures**: Unable to scale up when needed

## Best Practices

1. **Set Appropriate Capacity Limits**
   - Start with conservative limits
   - Monitor actual usage patterns
   - Adjust based on performance data

2. **Configure Auto-Scaling Thresholds**
   - Balance responsiveness vs stability
   - Consider workload patterns
   - Test scaling behavior under load

3. **Monitor Queue Length**
   - Keep queue size reasonable
   - Alert on sustained queue growth
   - Investigate causes of queuing

4. **Track Resource Utilization**
   - Ensure resources match capacity
   - Adjust allocations based on actual usage
   - Plan for peak loads

5. **Review Scaling History**
   - Analyze scaling patterns
   - Identify optimization opportunities
   - Adjust thresholds as needed

## Troubleshooting

### Queue Growing Continuously
- Check if agents are processing requests
- Verify agent health status
- Consider increasing capacity or adding agents
- Review request priority distribution

### Frequent Scaling Events
- Adjust scaling thresholds
- Increase minimum capacity
- Review workload patterns
- Consider more gradual scaling

### High Request Rejection Rate
- Increase maximum queue size
- Add more agent capacity
- Optimize request processing time
- Implement request throttling upstream

### Resource Exhaustion
- Review resource allocations
- Reduce per-agent allocations
- Add more system resources
- Optimize agent resource usage

## Future Enhancements

1. **Predictive Scaling**: Use historical data to predict load and scale proactively
2. **Multi-Region Support**: Distribute capacity across regions
3. **Cost Optimization**: Factor in cost when making scaling decisions
4. **Advanced Queuing**: Support for queue priorities and SLAs
5. **Capacity Reservations**: Allow reserving capacity for critical operations
