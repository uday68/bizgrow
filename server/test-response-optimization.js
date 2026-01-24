import express from 'express';
import { responseOptimization, getResponseTimeMetrics, getPerformanceMetrics } from './middleware/responseOptimization.js';

const app = express();

// Apply response optimization middleware
app.use(responseOptimization({
  compression: {
    threshold: 100, // Lower threshold for testing
    level: 6
  },
  monitoring: {
    slowThreshold: 500,
    trackPercentiles: true
  }
}));

// Test endpoints
app.get('/test/small', (req, res) => {
  res.json({ message: 'Small response', size: 'small' });
});

app.get('/test/large', (req, res) => {
  const largeData = {
    message: 'Large response for compression testing',
    data: Array(1000).fill().map((_, i) => ({
      id: i,
      name: `Item ${i}`,
      description: `This is a description for item ${i} with some additional text to make it larger`,
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        tags: ['test', 'data', 'compression', `item-${i}`]
      }
    }))
  };
  res.json(largeData);
});

app.get('/test/static.css', (req, res) => {
  res.set('Content-Type', 'text/css');
  res.send(`
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #333; color: white; padding: 20px; }
    .content { padding: 20px; background: #f5f5f5; }
    .footer { text-align: center; padding: 10px; color: #666; }
  `);
});

app.get('/test/metrics', (req, res) => {
  const responseMetrics = getResponseTimeMetrics();
  const performanceMetrics = getPerformanceMetrics();
  
  res.json({
    responseTime: responseMetrics,
    performance: performanceMetrics,
    timestamp: new Date().toISOString()
  });
});

// Start test server
const PORT = 3003;
app.listen(PORT, () => {
  console.log(`🧪 Response Optimization Test Server running on port ${PORT}`);
  console.log(`Test endpoints:`);
  console.log(`  GET http://localhost:${PORT}/test/small - Small response`);
  console.log(`  GET http://localhost:${PORT}/test/large - Large response (should be compressed)`);
  console.log(`  GET http://localhost:${PORT}/test/static.css - Static CSS (should have cache headers)`);
  console.log(`  GET http://localhost:${PORT}/test/metrics - Performance metrics`);
  console.log(`\nTest with curl to see headers:`);
  console.log(`  curl -H "Accept-Encoding: gzip" -v http://localhost:${PORT}/test/large`);
});