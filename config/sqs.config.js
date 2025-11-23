require('dotenv').config();
const { SQSClient } = require('@aws-sdk/client-sqs');

// Configuración de AWS SQS
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// URL de la cola SQS para emails
const EMAIL_QUEUE_URL = process.env.SQS_EMAIL_QUEUE_URL;

module.exports = {
  sqsClient,
  EMAIL_QUEUE_URL
};

