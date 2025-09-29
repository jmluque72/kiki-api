// Test setup file
const mongoose = require('mongoose');

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kiki-test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET = 'test-bucket';
process.env.PORT = '3001'; // Use different port for tests

// Global test timeout
jest.setTimeout(10000);

// Clean up after each test
afterEach(async () => {
  // Clean up any test data if needed
});

// Clean up after all tests
afterAll(async () => {
  // Close database connection
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
});
