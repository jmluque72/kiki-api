const request = require('supertest');
const { connectTestDB, disconnectTestDB, mockAWS } = require('./helpers/testHelpers');

// Mock AWS services
mockAWS();

let app;

describe('Basic API Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = require('./app.js');
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/non-existent-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message');
    });
  });
});
