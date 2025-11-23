require('dotenv').config();
const mongoose = require('mongoose');
const { ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, EMAIL_QUEUE_URL } = require('../config/sqs.config');
const config = require('../config/database');

// Importar funciones de email
const emailConfig = require('../config/email.config');
const emailService = require('../services/emailService');
const EmailError = require('../shared/models/EmailError');

// Configuración del worker
const POLL_INTERVAL = 5000; // 5 segundos entre polls
const MAX_MESSAGES = 10; // Máximo de mensajes a recibir por vez
const VISIBILITY_TIMEOUT = 300; // 5 minutos de visibilidad

// Mapa de tipos de email a funciones
const emailHandlers = {
  sendPasswordResetEmail: async (emailData) => {
    return await emailConfig.sendPasswordResetEmail(
      emailData.to || emailData.email,
      emailData.code,
      emailData.userName
    );
  },
  sendWelcomeEmail: async (emailData) => {
    return await emailConfig.sendWelcomeEmail(
      emailData.to || emailData.email,
      emailData.userName
    );
  },
  sendInstitutionWelcomeEmail: async (emailData) => {
    return await emailConfig.sendInstitutionWelcomeEmail(
      emailData.to || emailData.email,
      emailData.userName,
      emailData.institutionName,
      emailData.password
    );
  },
  sendFamilyInvitationEmail: async (emailData) => {
    return await emailConfig.sendFamilyInvitationEmail(
      emailData.to || emailData.email,
      emailData.userName,
      emailData.password
    );
  },
  sendFamilyInvitationNotificationEmail: async (emailData) => {
    return await emailConfig.sendFamilyInvitationNotificationEmail(
      emailData.to || emailData.email,
      emailData.userName,
      emailData.studentName
    );
  },
  sendNotificationEmail: async (emailData) => {
    return await emailConfig.sendNotificationEmail(
      emailData.to || emailData.email,
      emailData.subject,
      emailData.message,
      emailData.userName
    );
  },
  sendFamilyViewerCreatedEmail: async (emailData) => {
    return await emailService.sendFamilyViewerCreatedEmail(
      emailData.userData,
      emailData.password,
      emailData.institutionName
    );
  },
  sendNewUserCreatedEmail: async (emailData) => {
    return await emailService.sendNewUserCreatedEmail(
      emailData.userData,
      emailData.password,
      emailData.institutionName,
      emailData.roleType
    );
  },
  sendInstitutionAssociationEmail: async (emailData) => {
    return await emailService.sendInstitutionAssociationEmail(
      emailData.userData,
      emailData.institutionName,
      emailData.divisionName,
      emailData.role,
      emailData.studentInfo
    );
  }
};

/**
 * Procesa un mensaje de email desde SQS
 */
async function processEmailMessage(message) {
  try {
    const messageBody = JSON.parse(message.Body);
    const { emailType, emailData } = messageBody;

    if (!emailType || !emailHandlers[emailType]) {
      throw new Error(`Tipo de email desconocido: ${emailType}`);
    }

    console.log(`📧 [EMAIL WORKER] Procesando email tipo: ${emailType}`);
    console.log(`📧 [EMAIL WORKER] Destinatario: ${emailData.to || emailData.email || 'N/A'}`);

    // Ejecutar la función de email correspondiente
    const handler = emailHandlers[emailType];
    const result = await handler(emailData);

    console.log(`✅ [EMAIL WORKER] Email enviado exitosamente - Tipo: ${emailType}`);
    return { success: true, result };
  } catch (error) {
    console.error(`❌ [EMAIL WORKER] Error procesando email:`, error);
    throw error;
  }
}

/**
 * Guarda un error de email en MongoDB
 */
async function saveEmailError(message, error) {
  try {
    const messageBody = JSON.parse(message.Body);
    const { emailType, emailData } = messageBody;

    const emailError = new EmailError({
      emailType,
      recipient: emailData.to || emailData.email || 'unknown',
      emailData,
      error: error.message,
      errorDetails: {
        stack: error.stack,
        name: error.name
      },
      sqsMessageId: message.MessageId,
      processedAt: new Date()
    });

    await emailError.save();
    console.log(`💾 [EMAIL WORKER] Error guardado en MongoDB - ID: ${emailError._id}`);
  } catch (saveError) {
    console.error(`❌ [EMAIL WORKER] Error guardando error en MongoDB:`, saveError);
  }
}

/**
 * Elimina un mensaje de la cola SQS
 */
async function deleteMessage(receiptHandle) {
  try {
    const command = new DeleteMessageCommand({
      QueueUrl: EMAIL_QUEUE_URL,
      ReceiptHandle: receiptHandle
    });
    await sqsClient.send(command);
    console.log(`🗑️ [EMAIL WORKER] Mensaje eliminado de SQS`);
  } catch (error) {
    console.error(`❌ [EMAIL WORKER] Error eliminando mensaje de SQS:`, error);
  }
}

/**
 * Recibe y procesa mensajes de la cola SQS
 */
async function receiveAndProcessMessages() {
  try {
    if (!EMAIL_QUEUE_URL) {
      console.error('❌ [EMAIL WORKER] SQS_EMAIL_QUEUE_URL no está configurada');
      return;
    }

    const command = new ReceiveMessageCommand({
      QueueUrl: EMAIL_QUEUE_URL,
      MaxNumberOfMessages: MAX_MESSAGES,
      VisibilityTimeout: VISIBILITY_TIMEOUT,
      WaitTimeSeconds: 20 // Long polling
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return; // No hay mensajes
    }

    console.log(`📬 [EMAIL WORKER] Recibidos ${response.Messages.length} mensaje(s)`);

    // Procesar cada mensaje
    for (const message of response.Messages) {
      try {
        await processEmailMessage(message);
        // Si el procesamiento fue exitoso, eliminar el mensaje de la cola
        await deleteMessage(message.ReceiptHandle);
      } catch (error) {
        // Si hay error, guardar en MongoDB y eliminar de SQS para evitar reprocesamiento infinito
        await saveEmailError(message, error);
        await deleteMessage(message.ReceiptHandle);
      }
    }
  } catch (error) {
    console.error(`❌ [EMAIL WORKER] Error recibiendo mensajes de SQS:`, error);
  }
}

/**
 * Inicia el worker
 * @param {boolean} standalone - Si es true, conecta a MongoDB. Si es false, usa la conexión existente.
 */
async function startWorker(standalone = false) {
  try {
    // Si se ejecuta como proceso standalone, conectar a MongoDB
    // Si se ejecuta integrado, usar la conexión existente de mongoose
    if (standalone) {
      await mongoose.connect(config.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
      console.log('✅ [EMAIL WORKER] Conectado a MongoDB');
    } else {
      // Verificar si ya hay una conexión activa
      if (mongoose.connection.readyState === 0) {
        // No hay conexión, conectar
        await mongoose.connect(config.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
        console.log('✅ [EMAIL WORKER] Conectado a MongoDB');
      } else {
        console.log('✅ [EMAIL WORKER] Usando conexión MongoDB existente');
      }
    }

    console.log('🚀 [EMAIL WORKER] Iniciando worker de emails...');
    console.log(`📧 [EMAIL WORKER] Cola SQS: ${EMAIL_QUEUE_URL || 'NO CONFIGURADA'}`);

    if (!EMAIL_QUEUE_URL) {
      console.warn('⚠️  [EMAIL WORKER] SQS_EMAIL_QUEUE_URL no está configurada. El worker no procesará mensajes.');
      return;
    }

    // Iniciar polling continuo
    const poll = async () => {
      await receiveAndProcessMessages();
      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
  } catch (error) {
    console.error('❌ [EMAIL WORKER] Error iniciando worker:', error);
    if (standalone) {
      process.exit(1);
    }
    // Si está integrado, no hacer exit para no cerrar el servidor principal
  }
}

// Manejar cierre graceful (solo si se ejecuta como proceso standalone)
if (require.main === module) {
  process.on('SIGINT', async () => {
    console.log('\n🛑 [EMAIL WORKER] Cerrando worker...');
    await mongoose.connection.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 [EMAIL WORKER] Cerrando worker...');
    await mongoose.connection.close();
    process.exit(0);
  });
}

// Iniciar el worker si se ejecuta directamente (modo standalone)
if (require.main === module) {
  startWorker(true); // true = standalone mode, conecta a MongoDB
}

// También exportar startWorker para que pueda ser llamado desde simple-server.js

module.exports = {
  startWorker,
  processEmailMessage
};

