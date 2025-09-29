const request = require('supertest');
const mongoose = require('mongoose');

// Test database helper
const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  }
};

const disconnectTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

// Clean database helper
const cleanDatabase = async () => {
  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.warn('Warning: Could not clean database:', error.message);
    // Continue with tests even if cleanup fails
  }
};

// Create test user helper
const createTestUser = async (userData = {}) => {
  const User = require('../../shared/models/User');
  const bcrypt = require('bcryptjs');
  
  const defaultUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    role: 'user',
    ...userData
  };
  
  // Hash password
  const hashedPassword = await bcrypt.hash(defaultUser.password, 10);
  
  const user = new User({
    ...defaultUser,
    password: hashedPassword
  });
  
  await user.save();
  return user;
};

// Generate JWT token helper
const generateTestToken = (userId) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Mock AWS services
const mockAWS = () => {
  jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({})
    })),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn()
  }));

  jest.mock('@aws-sdk/client-ses', () => ({
    SESClient: jest.fn(() => ({
      send: jest.fn().mockResolvedValue({})
    })),
    SendEmailCommand: jest.fn()
  }));
};

module.exports = {
  connectTestDB,
  disconnectTestDB,
  cleanDatabase,
  createTestUser,
  generateTestToken,
  mockAWS
};
