import logger from './logger.js';
import agentHealthMonitor from './agentHealthMonitor.js';

/**
 * Agent Error Handler
 * Implements retry logic with exponential backoff and graceful degradation
 */
class AgentErrorHandler {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      retryableErrors: [
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'ENOTFOUND',
        'RATE_LIMIT_EXCEEDED',
        'SERVICE_UNAVAILABLE'
      ]
    };
    this.fallbackStrategies = new Map();
  }

  /**
   * Execute agent operation with retry logic
   */
  async executeWithRetry(agentName, operation, operationName, options = {}) {
    const config = {
      ...this.retryConfig,
      ...options
    };

    let lastError = null;
    let attempt = 0;
    const startTime = Date.now();

    while (attempt <= config.maxRetries) {
      try {
        logger.info('Executing agent operation', {
          type: 'agent_error_handler',
          agentName,
          operationName,
          attempt: attempt + 1,
          maxRetries: config.maxRetries + 1
        });

        const result = await operation();
        const responseTime = Date.now() - startTime;

        // Record successful request
        agentHealthMonitor.recordRequest(agentName, true, responseTime);

        logger.info('Agent operation succeeded', {
          type: 'agent_error_handler',
          agentName,
          operationName,
          attempt: attempt + 1,
          responseTime
        });

        return {
          success: true,
          result,
          attempts: attempt + 1,
          responseTime
        };
      } catch (error) {
        lastError = error;
        attempt++;

        const responseTime = Date.now() - startTime;

        // Record failed request
        agentHealthMonitor.recordRequest(agentName, false, responseTime, error);

        logger.error('Agent operation failed', {
          type: 'agent_error_handler',
          agentName,
          operationName,
          attempt,
          maxRetries: config.maxRetries,
          error: error.message,
          errorCode: error.code
        });

        // Check if error is retryable
        if (!this.isRetryableError(error, config)) {
          logger.warn('Non-retryable error encountered', {
            type: 'agent_error_handler',
            agentName,
            operationName,
            error: error.message
          });
          break;
        }

        // Check if we should retry
        if (attempt <= config.maxRetries) {
          const delay = this.calculateBackoffDelay(attempt, config);
          
          logger.info('Retrying agent operation', {
            type: 'agent_error_handler',
            agentName,
            operationName,
            attempt,
            delay
          });

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted, attempt graceful degradation
    logger.error('All retries exhausted', {
      type: 'agent_error_handler',
      agentName,
      operationName,
      attempts: attempt,
      error: lastError.message
    });

    const fallbackResult = await this.attemptGracefulDegradation(
      agentName,
      operationName,
      lastError
    );

    return {
      success: false,
      error: lastError.message,
      attempts: attempt,
      fallbackResult
    };
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error, config) {
    // Check error code
    if (error.code && config.retryableErrors.includes(error.code)) {
      return true;
    }

    // Check error message for retryable patterns
    const retryablePatterns = [
      /timeout/i,
      /rate limit/i,
      /too many requests/i,
      /service unavailable/i,
      /connection/i,
      /network/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Calculate exponential backoff delay
   */
  calculateBackoffDelay(attempt, config) {
    const delay = Math.min(
      config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
      config.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay; // ±30% jitter
    return Math.floor(delay + jitter);
  }

  /**
   * Sleep for specified duration
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register fallback strategy for an agent operation
   */
  registerFallbackStrategy(agentName, operationName, fallbackFn) {
    const key = `${agentName}:${operationName}`;
    this.fallbackStrategies.set(key, fallbackFn);

    logger.info('Fallback strategy registered', {
      type: 'agent_error_handler',
      agentName,
      operationName
    });
  }

  /**
   * Attempt graceful degradation
   */
  async attemptGracefulDegradation(agentName, operationName, error) {
    const key = `${agentName}:${operationName}`;

    if (this.fallbackStrategies.has(key)) {
      logger.info('Attempting graceful degradation', {
        type: 'agent_error_handler',
        agentName,
        operationName
      });

      try {
        const fallbackFn = this.fallbackStrategies.get(key);
        const result = await fallbackFn(error);

        logger.info('Graceful degradation succeeded', {
          type: 'agent_error_handler',
          agentName,
          operationName
        });

        return {
          success: true,
          result,
          degraded: true
        };
      } catch (fallbackError) {
        logger.error('Graceful degradation failed', {
          type: 'agent_error_handler',
          agentName,
          operationName,
          error: fallbackError.message
        });

        return {
          success: false,
          error: fallbackError.message,
          degraded: true
        };
      }
    }

    // No fallback strategy available
    logger.warn('No fallback strategy available', {
      type: 'agent_error_handler',
      agentName,
      operationName
    });

    return {
      success: false,
      message: 'No fallback strategy available',
      degraded: false
    };
  }

  /**
   * Execute with circuit breaker pattern
   */
  async executeWithCircuitBreaker(agentName, operation, operationName, options = {}) {
    const circuitKey = `${agentName}:${operationName}`;
    
    // Check if circuit is open
    if (this.isCircuitOpen(circuitKey)) {
      logger.warn('Circuit breaker is open', {
        type: 'agent_error_handler',
        agentName,
        operationName
      });

      // Attempt graceful degradation immediately
      const fallbackResult = await this.attemptGracefulDegradation(
        agentName,
        operationName,
        new Error('Circuit breaker open')
      );

      return {
        success: false,
        error: 'Circuit breaker open',
        circuitOpen: true,
        fallbackResult
      };
    }

    // Execute with retry
    const result = await this.executeWithRetry(agentName, operation, operationName, options);

    // Update circuit breaker state
    if (!result.success) {
      this.recordCircuitFailure(circuitKey);
    } else {
      this.recordCircuitSuccess(circuitKey);
    }

    return result;
  }

  /**
   * Check if circuit is open
   */
  isCircuitOpen(circuitKey) {
    // Simple implementation - can be enhanced with Redis for distributed systems
    const circuit = this.getCircuitState(circuitKey);
    
    if (circuit.state === 'open') {
      // Check if we should try half-open
      const timeSinceOpen = Date.now() - circuit.openedAt;
      if (timeSinceOpen > circuit.timeout) {
        circuit.state = 'half-open';
        this.setCircuitState(circuitKey, circuit);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record circuit failure
   */
  recordCircuitFailure(circuitKey) {
    const circuit = this.getCircuitState(circuitKey);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    // Open circuit if threshold exceeded
    if (circuit.failures >= circuit.threshold) {
      circuit.state = 'open';
      circuit.openedAt = Date.now();
      
      logger.warn('Circuit breaker opened', {
        type: 'agent_error_handler',
        circuitKey,
        failures: circuit.failures
      });
    }

    this.setCircuitState(circuitKey, circuit);
  }

  /**
   * Record circuit success
   */
  recordCircuitSuccess(circuitKey) {
    const circuit = this.getCircuitState(circuitKey);
    
    if (circuit.state === 'half-open') {
      // Close circuit on success in half-open state
      circuit.state = 'closed';
      circuit.failures = 0;
      
      logger.info('Circuit breaker closed', {
        type: 'agent_error_handler',
        circuitKey
      });
    } else {
      // Reset failure count on success
      circuit.failures = Math.max(0, circuit.failures - 1);
    }

    this.setCircuitState(circuitKey, circuit);
  }

  /**
   * Get circuit state
   */
  getCircuitState(circuitKey) {
    if (!this.circuits) {
      this.circuits = new Map();
    }

    if (!this.circuits.has(circuitKey)) {
      this.circuits.set(circuitKey, {
        state: 'closed',
        failures: 0,
        threshold: 5,
        timeout: 60000, // 1 minute
        openedAt: null,
        lastFailure: null
      });
    }

    return this.circuits.get(circuitKey);
  }

  /**
   * Set circuit state
   */
  setCircuitState(circuitKey, state) {
    if (!this.circuits) {
      this.circuits = new Map();
    }
    this.circuits.set(circuitKey, state);
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(circuitKey) {
    if (this.circuits && this.circuits.has(circuitKey)) {
      this.circuits.delete(circuitKey);
      
      logger.info('Circuit breaker reset', {
        type: 'agent_error_handler',
        circuitKey
      });
    }
  }

  /**
   * Get retry configuration
   */
  getRetryConfig() {
    return { ...this.retryConfig };
  }

  /**
   * Set retry configuration
   */
  setRetryConfig(config) {
    this.retryConfig = {
      ...this.retryConfig,
      ...config
    };

    logger.info('Retry configuration updated', {
      type: 'agent_error_handler',
      config: this.retryConfig
    });
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    if (!this.circuits) {
      return {};
    }

    const status = {};
    for (const [key, circuit] of this.circuits) {
      status[key] = {
        state: circuit.state,
        failures: circuit.failures,
        threshold: circuit.threshold,
        openedAt: circuit.openedAt,
        lastFailure: circuit.lastFailure
      };
    }

    return status;
  }
}

// Singleton instance
const agentErrorHandler = new AgentErrorHandler();

export default agentErrorHandler;
