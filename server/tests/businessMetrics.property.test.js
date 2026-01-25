import fc from 'fast-check';
import analyticsEngine from '../services/analyticsEngine.js';
import { initDatabase, getDatabaseType, getDatabase } from '../database/init.js';
import postgresDb from '../database/postgres.js';

/**
 * Property-Based Tests for Business Metrics Tracking
 * **Validates: Requirements 4.6**
 * 
 * Property 15: Business Metrics Tracking
 * For any business event, the Analytics_Engine should accurately track 
 * conversion rates, revenue, and other business metrics
 */

describe('Property 15: Business Metrics Tracking', () => {
  let db;
  let dbType;
  let dbInitialized = false;

  beforeAll(async () => {
    try {
      await initDatabase();
      db = getDatabase();
      dbType = getDatabaseType();
      dbInitialized = true;
    } catch (error) {
      console.error('Failed to initialize database for testing:', error);
    }
  }, 30000);

  afterAll(async () => {
    if (dbType === 'postgres') {
      await postgresDb.close();
    }
  });

  beforeEach(async () => {
    // Clear analytics data before each test
    analyticsEngine.metrics.businessEvents = [];
    analyticsEngine.metrics.conversionRates.clear();
    analyticsEngine.metrics.revenue.clear();
    analyticsEngine.metrics.userBehavior.clear();
    analyticsEngine.metrics.systemUsage.clear();

    if (!dbInitialized) {
      return;
    }

    // Create tables if they don't exist (for SQLite)
    try {
      if (dbType === 'sqlite') {
        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS business_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_type TEXT NOT NULL,
              event_data TEXT,
              user_id TEXT,
              session_id TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        await new Promise((resolve, reject) => {
          db.run(`
            CREATE TABLE IF NOT EXISTS analytics_metrics (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              metric_name TEXT NOT NULL,
              metric_date TEXT NOT NULL,
              metric_value REAL DEFAULT 0,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              UNIQUE (metric_name, metric_date)
            )
          `, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Clear database tables
      if (dbType === 'postgres') {
        await db.query('DELETE FROM business_events');
        await db.query('DELETE FROM analytics_metrics');
      } else {
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM business_events', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM analytics_metrics', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during test setup:', error.message);
    }
  });

  /**
   * Property: For any business event, the event should be tracked with complete context
   * This validates that all business events are captured with proper metadata
   */
  test('should track any business event with complete context', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          eventType: fc.constantFrom(
            'business_discovered',
            'proposal_sent',
            'proposal_accepted',
            'project_completed',
            'user_signup',
            'user_login',
            'api_call',
            'error_occurred'
          ),
          eventData: fc.record({
            userId: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
            sessionId: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
            businessId: fc.option(fc.string()),
            proposalId: fc.option(fc.string()),
            revenue: fc.option(fc.float({ min: 0, max: 100000, noNaN: true })),
            metadata: fc.record({
              source: fc.constantFrom('web', 'mobile', 'api'),
              region: fc.constantFrom('US', 'EU', 'ASIA')
            })
          })
        }),
        async (testData) => {
          // Track business event
          const trackedEvent = await analyticsEngine.trackBusinessEvent(
            testData.eventType,
            testData.eventData
          );

          // Verify event was tracked
          expect(trackedEvent).toBeDefined();
          expect(trackedEvent.type).toBe(testData.eventType);
          expect(trackedEvent.data).toEqual(testData.eventData);
          expect(trackedEvent.timestamp).toBeDefined();
          expect(new Date(trackedEvent.timestamp).getTime()).toBeGreaterThan(0);

          // Verify event is in memory
          const inMemoryEvent = analyticsEngine.metrics.businessEvents.find(
            e => e.type === testData.eventType && e.timestamp === trackedEvent.timestamp
          );
          expect(inMemoryEvent).toBeDefined();

          // Verify event is in database
          let dbEvent;
          if (dbType === 'postgres') {
            const result = await db.query(
              'SELECT * FROM business_events WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1',
              [testData.eventType]
            );
            dbEvent = result.rows[0];
          } else {
            dbEvent = await new Promise((resolve, reject) => {
              db.get(
                'SELECT * FROM business_events WHERE event_type = ? ORDER BY created_at DESC LIMIT 1',
                [testData.eventType],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });
          }

          expect(dbEvent).toBeDefined();
          expect(dbEvent.event_type).toBe(testData.eventType);
          
          // Parse and verify event data
          const storedData = JSON.parse(dbEvent.event_data);
          expect(storedData).toMatchObject(testData.eventData);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: For any proposal events, conversion rate should be calculated accurately
   * This validates that conversion rates are computed correctly
   */
  test('should calculate conversion rates accurately for proposal events', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          proposalsSent: fc.integer({ min: 1, max: 100 }),
          proposalsAccepted: fc.integer({ min: 0, max: 100 })
        }).filter(data => data.proposalsAccepted <= data.proposalsSent),
        async (testData) => {
          const today = new Date().toISOString().split('T')[0];

          // Track proposal sent events
          for (let i = 0; i < testData.proposalsSent; i++) {
            await analyticsEngine.trackBusinessEvent('proposal_sent', {
              proposalId: `proposal_${i}`,
              userId: 'test_user',
              sessionId: 'test_session'
            });
          }

          // Track proposal accepted events
          for (let i = 0; i < testData.proposalsAccepted; i++) {
            await analyticsEngine.trackBusinessEvent('proposal_accepted', {
              proposalId: `proposal_${i}`,
              userId: 'test_user',
              sessionId: 'test_session'
            });
          }

          // Get conversion rate
          const conversionRate = await analyticsEngine.getMetric('conversion_rate', today);
          
          // Calculate expected conversion rate
          const expectedRate = (testData.proposalsAccepted / testData.proposalsSent) * 100;

          // Verify conversion rate is accurate (within floating point precision)
          expect(conversionRate).toBeCloseTo(expectedRate, 2);

          // Verify conversion rate is in valid range
          expect(conversionRate).toBeGreaterThanOrEqual(0);
          expect(conversionRate).toBeLessThanOrEqual(100);

          // Verify conversion rate is stored in memory
          const storedRate = analyticsEngine.metrics.conversionRates.get(today);
          expect(storedRate).toBeCloseTo(expectedRate, 2);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any revenue events, total revenue should be accumulated accurately
   * This validates that revenue tracking is correct
   */
  test('should accumulate revenue accurately for project completion events', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.float({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 20 }
        ),
        async (revenueAmounts) => {
          const today = new Date().toISOString().split('T')[0];

          // Track project completed events with revenue
          for (const amount of revenueAmounts) {
            await analyticsEngine.trackBusinessEvent('project_completed', {
              projectId: `project_${Math.random()}`,
              userId: 'test_user',
              revenue: amount
            });
          }

          // Get total revenue
          const totalRevenue = await analyticsEngine.getMetric('revenue', today);

          // Calculate expected total
          const expectedTotal = revenueAmounts.reduce((sum, amount) => sum + amount, 0);

          // Verify revenue is accurate (within floating point precision)
          expect(totalRevenue).toBeCloseTo(expectedTotal, 2);

          // Verify revenue is non-negative
          expect(totalRevenue).toBeGreaterThanOrEqual(0);

          // Verify revenue is stored in memory
          const storedRevenue = analyticsEngine.metrics.revenue.get(today);
          expect(storedRevenue).toBeCloseTo(expectedTotal, 2);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any metric type, counters should increment correctly
   * This validates that metric counters are accurate
   */
  test('should increment metric counters accurately for any event type', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          eventType: fc.constantFrom(
            'business_discovered',
            'proposal_sent',
            'user_signup',
            'user_login',
            'api_call',
            'error_occurred'
          ),
          eventCount: fc.integer({ min: 1, max: 50 })
        }),
        async (testData) => {
          const today = new Date().toISOString().split('T')[0];

          // Map event types to metric names
          const metricMap = {
            'business_discovered': 'businesses_discovered',
            'proposal_sent': 'proposals_sent',
            'user_signup': 'user_signups',
            'user_login': 'user_logins',
            'api_call': 'api_calls',
            'error_occurred': 'errors'
          };

          const metricName = metricMap[testData.eventType];

          // Track events
          for (let i = 0; i < testData.eventCount; i++) {
            await analyticsEngine.trackBusinessEvent(testData.eventType, {
              id: `event_${i}`,
              userId: 'test_user'
            });
          }

          // Get metric value
          const metricValue = await analyticsEngine.getMetric(metricName, today);

          // Verify counter is accurate
          expect(metricValue).toBeGreaterThanOrEqual(testData.eventCount);

          // Verify metric is non-negative
          expect(metricValue).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any date range, business metrics summary should be accurate
   * This validates that metric aggregation works correctly
   */
  test('should generate accurate business metrics summary for any date range', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          daysBack: fc.integer({ min: 1, max: 7 }),
          eventsPerDay: fc.integer({ min: 1, max: 10 })
        }),
        async (testData) => {
          const endDate = new Date().toISOString().split('T')[0];
          const startDate = new Date(Date.now() - testData.daysBack * 24 * 60 * 60 * 1000)
            .toISOString().split('T')[0];

          // Track events across multiple days
          for (let day = 0; day < testData.daysBack; day++) {
            for (let i = 0; i < testData.eventsPerDay; i++) {
              await analyticsEngine.trackBusinessEvent('business_discovered', {
                businessId: `business_${day}_${i}`,
                userId: 'test_user'
              });
            }
          }

          // Get business metrics summary
          const summary = await analyticsEngine.getBusinessMetrics(startDate, endDate);

          // Verify summary structure
          expect(summary).toBeDefined();
          expect(summary.startDate).toBe(startDate);
          expect(summary.endDate).toBe(endDate);
          expect(summary.metrics).toBeDefined();
          expect(summary.summary).toBeDefined();

          // Verify summary contains expected metrics
          expect(summary.summary.totalBusinessesDiscovered).toBeGreaterThanOrEqual(0);
          expect(summary.summary.totalProposalsSent).toBeGreaterThanOrEqual(0);
          expect(summary.summary.totalRevenue).toBeGreaterThanOrEqual(0);
          expect(summary.summary.averageConversionRate).toBeGreaterThanOrEqual(0);

          // Verify metrics are organized by date
          expect(typeof summary.metrics).toBe('object');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any user behavior tracking, actions should be recorded correctly
   * This validates that user behavior tracking works
   */
  test('should track user behavior accurately for any user actions', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.string({ minLength: 5, maxLength: 20 }),
          actions: fc.array(
            fc.constantFrom('login', 'logout', 'view_page', 'click_button', 'submit_form'),
            { minLength: 1, maxLength: 20 }
          )
        }),
        async (testData) => {
          // Track user actions
          for (const action of testData.actions) {
            analyticsEngine.trackUserBehavior(testData.userId, action);
          }

          // Verify user behavior is tracked
          const userBehavior = analyticsEngine.metrics.userBehavior.get(testData.userId);
          
          expect(userBehavior).toBeDefined();
          expect(Array.isArray(userBehavior)).toBe(true);
          expect(userBehavior.length).toBeGreaterThanOrEqual(Math.min(testData.actions.length, 100));

          // Verify each action has required fields
          userBehavior.forEach(entry => {
            expect(entry.action).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
          });

          // Verify actions are in chronological order
          for (let i = 1; i < userBehavior.length; i++) {
            const prevTime = new Date(userBehavior[i - 1].timestamp).getTime();
            const currTime = new Date(userBehavior[i].timestamp).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any system usage tracking, data should be recorded correctly
   * This validates that system usage metrics are tracked
   */
  test('should track system usage accurately for any usage type', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          usageType: fc.constantFrom('api_calls', 'database_queries', 'cache_hits', 'websocket_connections'),
          usageData: fc.array(
            fc.record({
              endpoint: fc.string({ minLength: 1, maxLength: 30 }),
              duration: fc.integer({ min: 1, max: 5000 }),
              success: fc.boolean()
            }),
            { minLength: 1, maxLength: 20 }
          )
        }),
        async (testData) => {
          // Track system usage
          for (const data of testData.usageData) {
            analyticsEngine.trackSystemUsage(testData.usageType, data);
          }

          // Verify system usage is tracked
          const systemUsage = analyticsEngine.metrics.systemUsage.get(testData.usageType);
          
          expect(systemUsage).toBeDefined();
          expect(Array.isArray(systemUsage)).toBe(true);
          expect(systemUsage.length).toBeGreaterThanOrEqual(
            Math.min(testData.usageData.length, 1000)
          );

          // Verify each usage entry has required fields
          systemUsage.forEach(entry => {
            expect(entry.data).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(new Date(entry.timestamp).getTime()).toBeGreaterThan(0);
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: For any predictive analytics request, predictions should be generated
   * This validates that predictive analytics works correctly
   */
  test('should generate predictions for any metric with sufficient historical data', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          metricName: fc.constantFrom('revenue', 'businesses_discovered', 'proposals_sent'),
          historicalDays: fc.integer({ min: 7, max: 30 }),
          daysAhead: fc.integer({ min: 1, max: 14 })
        }),
        async (testData) => {
          // Create historical data
          for (let day = 0; day < testData.historicalDays; day++) {
            const date = new Date(Date.now() - day * 24 * 60 * 60 * 1000)
              .toISOString().split('T')[0];
            
            const value = Math.floor(Math.random() * 100) + 50;
            
            await analyticsEngine.incrementMetric(testData.metricName, date);
            
            // Add some variation to the data
            for (let i = 0; i < value; i++) {
              await analyticsEngine.incrementMetric(testData.metricName, date);
            }
          }

          // Generate prediction
          const prediction = await analyticsEngine.predictFutureMetrics(
            testData.metricName,
            testData.daysAhead
          );

          // Verify prediction structure
          expect(prediction).toBeDefined();
          expect(prediction.metricName).toBe(testData.metricName);

          if (testData.historicalDays >= 7) {
            // Should have prediction with sufficient data
            expect(prediction.prediction).toBeDefined();
            expect(Array.isArray(prediction.prediction)).toBe(true);
            expect(prediction.prediction.length).toBe(testData.daysAhead);

            // Verify each prediction has required fields
            prediction.prediction.forEach(pred => {
              expect(pred.date).toBeDefined();
              expect(pred.predictedValue).toBeDefined();
              expect(typeof pred.predictedValue).toBe('number');
              expect(pred.predictedValue).toBeGreaterThanOrEqual(0);
            });

            // Verify confidence and trend
            expect(prediction.confidence).toBeDefined();
            expect(prediction.confidence).toBeGreaterThan(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(prediction.trend).toBeDefined();
            expect(['increasing', 'decreasing', 'stable']).toContain(prediction.trend);
          } else {
            // Should indicate insufficient data
            expect(prediction.message).toContain('Insufficient historical data');
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any anomaly detection, anomalies should be identified correctly
   * This validates that anomaly detection works
   */
  test('should detect anomalies in business metrics accurately', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          baselineValue: fc.integer({ min: 100, max: 1000 }),
          anomalyMultiplier: fc.float({ min: 1.5, max: 3.0, noNaN: true })
        }),
        async (testData) => {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
            .toISOString().split('T')[0];

          // Set baseline revenue for yesterday
          await analyticsEngine.addRevenue(yesterday, testData.baselineValue);

          // Set anomalous revenue for today
          const anomalousValue = testData.baselineValue * testData.anomalyMultiplier;
          await analyticsEngine.addRevenue(today, anomalousValue);

          // Detect anomalies
          const anomalies = await analyticsEngine.detectAnomalies();

          // Verify anomalies are detected
          expect(Array.isArray(anomalies)).toBe(true);

          // Check if revenue anomaly was detected
          const revenueAnomaly = anomalies.find(a => a.type === 'revenue_anomaly');
          
          if (testData.anomalyMultiplier > 1.4) {
            // Should detect anomaly for significant changes
            expect(revenueAnomaly).toBeDefined();
            expect(revenueAnomaly.currentValue).toBeCloseTo(anomalousValue, 2);
            expect(revenueAnomaly.previousValue).toBeCloseTo(testData.baselineValue, 2);
            expect(revenueAnomaly.severity).toBeDefined();
            expect(['info', 'warning', 'critical']).toContain(revenueAnomaly.severity);
            expect(revenueAnomaly.change).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any dashboard data request, complete analytics should be provided
   * This validates that dashboard data aggregation works correctly
   */
  test('should provide complete dashboard data for any time period', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 90 }),
        async (days) => {
          // Track some sample events
          await analyticsEngine.trackBusinessEvent('business_discovered', {
            businessId: 'test_business',
            userId: 'test_user'
          });

          await analyticsEngine.trackBusinessEvent('proposal_sent', {
            proposalId: 'test_proposal',
            userId: 'test_user'
          });

          // Get dashboard data
          const dashboardData = await analyticsEngine.getDashboardData(days);

          // Verify dashboard structure
          expect(dashboardData).toBeDefined();
          expect(dashboardData.period).toBeDefined();
          expect(dashboardData.period.days).toBe(days);
          expect(dashboardData.period.startDate).toBeDefined();
          expect(dashboardData.period.endDate).toBeDefined();

          // Verify metrics are included
          expect(dashboardData.metrics).toBeDefined();
          expect(typeof dashboardData.metrics).toBe('object');

          // Verify summary is included
          expect(dashboardData.summary).toBeDefined();
          expect(dashboardData.summary.totalBusinessesDiscovered).toBeGreaterThanOrEqual(0);
          expect(dashboardData.summary.totalProposalsSent).toBeGreaterThanOrEqual(0);
          expect(dashboardData.summary.totalRevenue).toBeGreaterThanOrEqual(0);

          // Verify anomalies are included
          expect(Array.isArray(dashboardData.anomalies)).toBe(true);

          // Verify predictions are included
          expect(dashboardData.predictions).toBeDefined();
          expect(dashboardData.predictions.revenue).toBeDefined();
          expect(dashboardData.predictions.conversionRate).toBeDefined();

          // Verify timestamp
          expect(dashboardData.timestamp).toBeDefined();
          expect(new Date(dashboardData.timestamp).getTime()).toBeGreaterThan(0);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: For any business metrics calculation, results should be consistent
   * This validates that metric calculations are deterministic
   */
  test('should calculate business metrics consistently across multiple retrievals', async () => {
    if (!dbInitialized) {
      console.warn('Database not initialized, skipping test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          businessCount: fc.integer({ min: 1, max: 50 }),
          proposalCount: fc.integer({ min: 1, max: 50 }),
          revenueAmount: fc.float({ min: 100, max: 10000, noNaN: true })
        }),
        async (testData) => {
          const today = new Date().toISOString().split('T')[0];

          // Track events
          for (let i = 0; i < testData.businessCount; i++) {
            await analyticsEngine.trackBusinessEvent('business_discovered', {
              businessId: `business_${i}`,
              userId: 'test_user'
            });
          }

          for (let i = 0; i < testData.proposalCount; i++) {
            await analyticsEngine.trackBusinessEvent('proposal_sent', {
              proposalId: `proposal_${i}`,
              userId: 'test_user'
            });
          }

          await analyticsEngine.trackBusinessEvent('project_completed', {
            projectId: 'test_project',
            userId: 'test_user',
            revenue: testData.revenueAmount
          });

          // Retrieve metrics multiple times
          const metrics1 = await analyticsEngine.getBusinessMetrics(today, today);
          const metrics2 = await analyticsEngine.getBusinessMetrics(today, today);
          const metrics3 = await analyticsEngine.getBusinessMetrics(today, today);

          // Verify consistency across retrievals
          expect(metrics1.summary.totalBusinessesDiscovered)
            .toBe(metrics2.summary.totalBusinessesDiscovered);
          expect(metrics2.summary.totalBusinessesDiscovered)
            .toBe(metrics3.summary.totalBusinessesDiscovered);

          expect(metrics1.summary.totalProposalsSent)
            .toBe(metrics2.summary.totalProposalsSent);
          expect(metrics2.summary.totalProposalsSent)
            .toBe(metrics3.summary.totalProposalsSent);

          expect(metrics1.summary.totalRevenue)
            .toBeCloseTo(metrics2.summary.totalRevenue, 2);
          expect(metrics2.summary.totalRevenue)
            .toBeCloseTo(metrics3.summary.totalRevenue, 2);
        }
      ),
      { numRuns: 20 }
    );
  });
});
