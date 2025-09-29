// Test app that doesn't start the server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Importar configuración
require('dotenv').config();
const config = require('../config/database');
const { generateSignedUrl } = require('../config/s3.config');

// Importar modelos
const User = require('../shared/models/User');
const Account = require('../shared/models/Account');
const Group = require('../shared/models/Group');
const Event = require('../shared/models/Event');
const EventAuthorization = require('../shared/models/EventAuthorization');
const Role = require('../shared/models/Role');
const Shared = require('../shared/models/Shared');
const Grupo = require('../shared/models/Grupo');
const Asistencia = require('../shared/models/Asistencia');
const Activity = require('../shared/models/Activity');
const ActivityFavorite = require('../shared/models/ActivityFavorite');
const Student = require('../shared/models/Student');
const Notification = require('../shared/models/Notification');
const Device = require('../shared/models/Device');
const Pickup = require('../shared/models/Pickup');
const RequestedShared = require('../shared/models/RequestedShared');
const PasswordReset = require('../shared/models/PasswordReset');
const ActiveAssociation = require('../shared/models/ActiveAssociation');
const { sendPasswordResetEmail, sendWelcomeEmail, sendInstitutionWelcomeEmail, sendFamilyInvitationEmail, sendNotificationEmail, generateRandomPassword, sendEmailAsync } = require('../config/email.config');
const emailService = require('../services/emailService');

// Create Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API de Kiki está funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: ['users', 'accounts', 'groups', 'events', 'roles']
  });
});

// Middleware para rutas no encontradas (debe ir al final)
app.use('/*', (req, res) => {
  console.log(`❌ [404] Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado'
  });
});

module.exports = app;
