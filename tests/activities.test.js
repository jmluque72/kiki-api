const request = require('supertest');
const { connectTestDB, disconnectTestDB, cleanDatabase, createTestUser, generateTestToken, mockAWS } = require('./helpers/testHelpers');

// Mock AWS services
mockAWS();

let app;

describe('Activities Endpoints', () => {
  let authToken;
  let testUser;
  let testInstitution;

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

    // Create a test institution
    const institutionData = {
      name: 'Test Institution',
      type: 'school',
      address: '123 Test Street',
      city: 'Test City',
      phone: '1234567890',
      email: 'contact@testinstitution.com'
    };

    const institutionResponse = await request(app)
      .post('/api/institutions')
      .set('Authorization', `Bearer ${authToken}`)
      .send(institutionData);

    testInstitution = institutionResponse.body;
  });

  describe('GET /api/activities', () => {
    it('should get all activities', async () => {
      const response = await request(app)
        .get('/api/activities')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should filter activities by institution', async () => {
      const response = await request(app)
        .get(`/api/activities?institution=${testInstitution._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/activities');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/activities', () => {
    it('should create new activity with valid data', async () => {
      const activityData = {
        title: 'Test Activity',
        description: 'This is a test activity',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.title).toBe('Test Activity');
    });

    it('should return 400 with missing required fields', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Activity'
          // missing required fields
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 with invalid date format', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Activity',
          description: 'This is a test activity',
          date: 'invalid-date',
          institution: testInstitution._id,
          type: 'academic',
          status: 'scheduled'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/activities/:id', () => {
    it('should get activity by ID', async () => {
      // First create an activity
      const activityData = {
        title: 'Test Activity',
        description: 'This is a test activity',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const createResponse = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      const activityId = createResponse.body._id;

      const response = await request(app)
        .get(`/api/activities/${activityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.title).toBe('Test Activity');
    });

    it('should return 404 for non-existent activity', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .get(`/api/activities/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/activities/:id', () => {
    it('should update activity with valid data', async () => {
      // First create an activity
      const activityData = {
        title: 'Original Activity',
        description: 'This is the original activity',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const createResponse = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      const activityId = createResponse.body._id;

      const updateData = {
        title: 'Updated Activity',
        status: 'completed'
      };

      const response = await request(app)
        .put(`/api/activities/${activityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Updated Activity');
      expect(response.body.status).toBe('completed');
    });

    it('should return 400 with invalid data', async () => {
      // First create an activity
      const activityData = {
        title: 'Test Activity',
        description: 'This is a test activity',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const createResponse = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      const activityId = createResponse.body._id;

      const response = await request(app)
        .put(`/api/activities/${activityId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          date: 'invalid-date'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/activities/:id', () => {
    it('should delete activity', async () => {
      // First create an activity
      const activityData = {
        title: 'Activity to Delete',
        description: 'This activity will be deleted',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const createResponse = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      const activityId = createResponse.body._id;

      const response = await request(app)
        .delete(`/api/activities/${activityId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent activity', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .delete(`/api/activities/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/activities/:id/upload-image', () => {
    it('should upload image for activity', async () => {
      // First create an activity
      const activityData = {
        title: 'Test Activity',
        description: 'This is a test activity',
        date: new Date().toISOString(),
        institution: testInstitution._id,
        type: 'academic',
        status: 'scheduled'
      };

      const createResponse = await request(app)
        .post('/api/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .send(activityData);

      const activityId = createResponse.body._id;

      // Mock file upload
      const response = await request(app)
        .post(`/api/activities/${activityId}/upload-image`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', Buffer.from('fake-image-data'), 'test.jpg');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('imageUrl');
    });
  });
});
