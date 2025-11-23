const { SendMessageCommand } = require('@aws-sdk/client-sqs');
const { sqsClient, EMAIL_QUEUE_URL } = require('../config/sqs.config');

/**
 * Envía un mensaje a la cola SQS para procesamiento asíncrono de email
 * @param {string} emailType - Tipo de email a enviar (ej: 'sendPasswordResetEmail')
 * @param {object} emailData - Datos del email (to, subject, body, etc.)
 * @returns {Promise<object>} Resultado del envío a SQS
 */
async function sendEmailToQueue(emailType, emailData) {
  try {
    if (!EMAIL_QUEUE_URL) {
      console.error('❌ [SQS EMAIL] SQS_EMAIL_QUEUE_URL no está configurada');
      throw new Error('SQS_EMAIL_QUEUE_URL no está configurada en las variables de entorno');
    }

    const messageBody = {
      emailType,
      emailData,
      timestamp: new Date().toISOString()
    };

    const command = new SendMessageCommand({
      QueueUrl: EMAIL_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        EmailType: {
          DataType: 'String',
          StringValue: emailType
        },
        Recipient: {
          DataType: 'String',
          StringValue: emailData.to || emailData.email || 'unknown'
        }
      }
    });

    const result = await sqsClient.send(command);
    console.log(`✅ [SQS EMAIL] Mensaje enviado a cola SQS - Tipo: ${emailType}, MessageId: ${result.MessageId}`);
    
    return {
      success: true,
      messageId: result.MessageId,
      queueUrl: EMAIL_QUEUE_URL
    };
  } catch (error) {
    console.error('❌ [SQS EMAIL] Error enviando mensaje a SQS:', error.message);
    // No lanzar el error para no bloquear el flujo principal
    // Solo loguear el error
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Funciones helper para enviar tipos específicos de email a SQS
 */
async function sendPasswordResetEmailToQueue(email, code, userName) {
  return await sendEmailToQueue('sendPasswordResetEmail', {
    to: email,
    code,
    userName
  });
}

async function sendWelcomeEmailToQueue(email, userName) {
  return await sendEmailToQueue('sendWelcomeEmail', {
    to: email,
    userName
  });
}

async function sendInstitutionWelcomeEmailToQueue(email, userName, institutionName, password) {
  return await sendEmailToQueue('sendInstitutionWelcomeEmail', {
    to: email,
    userName,
    institutionName,
    password
  });
}

async function sendFamilyInvitationEmailToQueue(email, userName, password) {
  return await sendEmailToQueue('sendFamilyInvitationEmail', {
    to: email,
    userName,
    password
  });
}

async function sendFamilyInvitationNotificationEmailToQueue(email, userName, studentName) {
  return await sendEmailToQueue('sendFamilyInvitationNotificationEmail', {
    to: email,
    userName,
    studentName
  });
}

async function sendNotificationEmailToQueue(email, subject, message, userName) {
  return await sendEmailToQueue('sendNotificationEmail', {
    to: email,
    subject,
    message,
    userName
  });
}

async function sendFamilyViewerCreatedEmailToQueue(userData, password, institutionName) {
  return await sendEmailToQueue('sendFamilyViewerCreatedEmail', {
    userData,
    password,
    institutionName
  });
}

async function sendNewUserCreatedEmailToQueue(userData, password, institutionName, roleType) {
  return await sendEmailToQueue('sendNewUserCreatedEmail', {
    userData,
    password,
    institutionName,
    roleType
  });
}

async function sendInstitutionAssociationEmailToQueue(userData, institutionName, divisionName, role, studentInfo) {
  return await sendEmailToQueue('sendInstitutionAssociationEmail', {
    userData,
    institutionName,
    divisionName,
    role,
    studentInfo
  });
}

module.exports = {
  sendEmailToQueue,
  sendPasswordResetEmailToQueue,
  sendWelcomeEmailToQueue,
  sendInstitutionWelcomeEmailToQueue,
  sendFamilyInvitationEmailToQueue,
  sendFamilyInvitationNotificationEmailToQueue,
  sendNotificationEmailToQueue,
  sendFamilyViewerCreatedEmailToQueue,
  sendNewUserCreatedEmailToQueue,
  sendInstitutionAssociationEmailToQueue
};

