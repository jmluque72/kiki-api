const request = require('supertest');
const { connectTestDB, disconnectTestDB, cleanDatabase, createTestUser, generateTestToken, mockAWS } = require('./helpers/testHelpers');

// Mock AWS services
mockAWS();

let app;

describe('Institutions Endpoints', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    await connectTestDB();
    app = require('../simple-server.js');
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await cleanDatabase();
    testUser = await createTestUser({
      email: 'admin@example.com',
      role: 'admin'
    });
    authToken = generateTestToken(testUser._id);
  });

  describe('GET /api/institutions', () => {
    it('should get all institutions', async () => {
      const response = await request(app)
        .get('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/institutions');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/institutions', () => {
    it('should create new institution with valid data', async () => {
      const institutionData = {
        name: 'Test Institution',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const response = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe('Test Institution');
    });

    it('should return 400 with missing required fields', async () => {
      const response = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Institution'
          // missing required fields
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 with invalid email format', async () => {
      const response = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Institution',
          type: 'school',
          address: '123 Test Street',
          city: 'Test City',
          phone: '1234567890',
          email: 'invalid-email'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/institutions/:id', () => {
    it('should get institution by ID', async () => {
      // First create an institution
      const institutionData = {
        name: 'Test Institution',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const createResponse = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      const institutionId = createResponse.body._id;

      const response = await request(app)
        .get(`/api/institutions/${institutionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.name).toBe('Test Institution');
    });

    it('should return 404 for non-existent institution', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .get(`/api/institutions/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/institutions/:id', () => {
    it('should update institution with valid data', async () => {
      // First create an institution
      const institutionData = {
        name: 'Original Institution',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const createResponse = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      const institutionId = createResponse.body._id;

      const updateData = {
        name: 'Updated Institution',
        phone: '9876543210'
      };

      const response = await request(app)
        .put(`/api/institutions/${institutionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Institution');
      expect(response.body.phone).toBe('9876543210');
    });

    it('should return 400 with invalid data', async () => {
      // First create an institution
      const institutionData = {
        name: 'Test Institution',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const createResponse = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      const institutionId = createResponse.body._id;

      const response = await request(app)
        .put(`/api/institutions/${institutionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/institutions/:id', () => {
    it('should delete institution', async () => {
      // First create an institution
      const institutionData = {
        name: 'Institution to Delete',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const createResponse = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      const institutionId = createResponse.body._id;

      const response = await request(app)
        .delete(`/api/institutions/${institutionId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent institution', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .delete(`/api/institutions/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/institutions/:id/students', () => {
    it('should get students for an institution', async () => {
      // First create an institution
      const institutionData = {
        name: 'Test Institution',
        type: 'school',
        address: '123 Test Street',
        city: 'Test City',
        phone: '1234567890',
        email: 'contact@testinstitution.com'
      };

      const createResponse = await request(app)
        .post('/api/institutions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(institutionData);

      const institutionId = createResponse.body._id;

      const response = await request(app)
        .get(`/api/institutions/${institutionId}/students`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
