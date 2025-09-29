const request = require('supertest');
const { connectTestDB, disconnectTestDB, cleanDatabase, createTestUser, generateTestToken, mockAWS } = require('./helpers/testHelpers');

// Mock AWS services
mockAWS();

// Import the app
let app;

describe('Authentication Endpoints', () => {
  beforeAll(async () => {
    await connectTestDB();
    app = require('../simple-server.js');
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Create a test user first
      const testUser = await createTestUser({
        email: 'test@example.com',
        password: 'password123'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return 401 with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
          // missing password
        });

      expect(response.status).toBe(400);
    });

    it('should return 400 with invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
        role: 'user'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('newuser@example.com');
    });

    it('should return 400 with duplicate email', async () => {
      // Create a user first
      await createTestUser({
        email: 'existing@example.com'
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 400 with weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '123', // too short
          name: 'Test User'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should send reset email for existing user', async () => {
      await createTestUser({
        email: 'test@example.com'
      });

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existing user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const testUser = await createTestUser({
        email: 'test@example.com'
      });

      // Generate a valid reset token (you'll need to implement this in your auth logic)
      const resetToken = generateTestToken(testUser._id);

      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'invalid-token',
          newPassword: 'newpassword123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user data with valid token', async () => {
      const testUser = await createTestUser({
        email: 'test@example.com'
      });
      const token = generateTestToken(testUser._id);

      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
