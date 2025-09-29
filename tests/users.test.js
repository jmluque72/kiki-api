const request = require('supertest');
const { connectTestDB, disconnectTestDB, cleanDatabase, createTestUser, generateTestToken, mockAWS } = require('./helpers/testHelpers');

// Mock AWS services
mockAWS();

let app;

describe('Users Endpoints', () => {
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
      email: 'test@example.com',
      role: 'admin'
    });
    authToken = generateTestToken(testUser._id);
  });

  describe('GET /api/users', () => {
    it('should get all users with admin role', async () => {
      // Create additional test users
      await createTestUser({ email: 'user1@example.com', role: 'user' });
      await createTestUser({ email: 'user2@example.com', role: 'user' });

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should return 403 for non-admin users', async () => {
      const regularUser = await createTestUser({
        email: 'regular@example.com',
        role: 'user'
      });
      const regularToken = generateTestToken(regularUser._id);

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${regularToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/users');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get user by ID', async () => {
      const targetUser = await createTestUser({
        email: 'target@example.com'
      });

      const response = await request(app)
        .get(`/api/users/${targetUser._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.email).toBe('target@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update user with valid data', async () => {
      const userToUpdate = await createTestUser({
        email: 'update@example.com',
        name: 'Original Name'
      });

      const updateData = {
        name: 'Updated Name',
        role: 'user'
      };

      const response = await request(app)
        .put(`/api/users/${userToUpdate._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should return 400 with invalid data', async () => {
      const userToUpdate = await createTestUser({
        email: 'update@example.com'
      });

      const response = await request(app)
        .put(`/api/users/${userToUpdate._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'invalid-email' // invalid email format
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete user', async () => {
      const userToDelete = await createTestUser({
        email: 'delete@example.com'
      });

      const response = await request(app)
        .delete(`/api/users/${userToDelete._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const response = await request(app)
        .delete(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/users/profile', () => {
    it('should get current user profile', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update current user profile', async () => {
      const updateData = {
        name: 'Updated Profile Name',
        phone: '1234567890'
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Profile Name');
    });
  });
});
