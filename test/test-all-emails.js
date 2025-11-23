const emailConfig = require('./config/email.config');
const emailServiceInstance = require('./services/emailService');

async function testAllEmails() {
  const testEmail = 'jmluque72@gmail.com';
  console.log('📧 [TEST ALL EMAILS] Enviando todos los tipos de emails a:', testEmail);
  const results = [];
  const testUserData = {
    name: 'Usuario de Prueba',
    email: testEmail
  };
  
  // 1. Email de recuperación de contraseña
  try {
    await emailConfig.sendPasswordResetEmail(testEmail, '123456', 'Usuario de Prueba');
    results.push({ type: 'sendPasswordResetEmail', status: 'success' });
    console.log('✅ [TEST] Email de recuperación de contraseña enviado');
  } catch (error) {
    results.push({ type: 'sendPasswordResetEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendPasswordResetEmail:', error.message);
  }
  
  // 2. Email de bienvenida de institución
  try {
    await emailConfig.sendInstitutionWelcomeEmail(testEmail, 'Usuario Admin', 'Institución de Prueba', 'TestPass123!');
    results.push({ type: 'sendInstitutionWelcomeEmail', status: 'success' });
    console.log('✅ [TEST] Email de bienvenida de institución enviado');
  } catch (error) {
    results.push({ type: 'sendInstitutionWelcomeEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendInstitutionWelcomeEmail:', error.message);
  }
  
  // 3. Email de bienvenida general
  try {
    await emailConfig.sendWelcomeEmail(testEmail, 'Usuario de Prueba');
    results.push({ type: 'sendWelcomeEmail', status: 'success' });
    console.log('✅ [TEST] Email de bienvenida general enviado');
  } catch (error) {
    results.push({ type: 'sendWelcomeEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendWelcomeEmail:', error.message);
  }
  
  // 4. Email de invitación familiar
  try {
    await emailConfig.sendFamilyInvitationEmail(testEmail, 'Usuario Familiar', 'TestPass123!');
    results.push({ type: 'sendFamilyInvitationEmail', status: 'success' });
    console.log('✅ [TEST] Email de invitación familiar enviado');
  } catch (error) {
    results.push({ type: 'sendFamilyInvitationEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendFamilyInvitationEmail:', error.message);
  }
  
  // 5. Email de notificación de invitación familiar
  try {
    await emailConfig.sendFamilyInvitationNotificationEmail(testEmail, 'Usuario Familiar', 'Juan Pérez');
    results.push({ type: 'sendFamilyInvitationNotificationEmail', status: 'success' });
    console.log('✅ [TEST] Email de notificación de invitación familiar enviado');
  } catch (error) {
    results.push({ type: 'sendFamilyInvitationNotificationEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendFamilyInvitationNotificationEmail:', error.message);
  }
  
  // 6. Email de notificación general
  try {
    await emailConfig.sendNotificationEmail(testEmail, 'Notificación de Prueba', 'Este es un mensaje de prueba', 'Usuario de Prueba');
    results.push({ type: 'sendNotificationEmail', status: 'success' });
    console.log('✅ [TEST] Email de notificación general enviado');
  } catch (error) {
    results.push({ type: 'sendNotificationEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendNotificationEmail:', error.message);
  }
  
  // 7. Email de usuario familyviewer creado
  try {
    await emailServiceInstance.sendFamilyViewerCreatedEmail(testUserData, 'TestPass123!', 'Institución de Prueba');
    results.push({ type: 'sendFamilyViewerCreatedEmail', status: 'success' });
    console.log('✅ [TEST] Email de familyviewer creado enviado');
  } catch (error) {
    results.push({ type: 'sendFamilyViewerCreatedEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendFamilyViewerCreatedEmail:', error.message);
  }
  
  // 8. Email de nuevo usuario creado (coordinador)
  try {
    await emailServiceInstance.sendNewUserCreatedEmail(testUserData, 'TestPass123!', 'Institución de Prueba', 'coordinador');
    results.push({ type: 'sendNewUserCreatedEmail (coordinador)', status: 'success' });
    console.log('✅ [TEST] Email de nuevo usuario coordinador enviado');
  } catch (error) {
    results.push({ type: 'sendNewUserCreatedEmail (coordinador)', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendNewUserCreatedEmail (coordinador):', error.message);
  }
  
  // 9. Email de nuevo usuario creado (adminaccount)
  try {
    await emailServiceInstance.sendNewUserCreatedEmail(testUserData, 'TestPass123!', 'Institución de Prueba', 'adminaccount');
    results.push({ type: 'sendNewUserCreatedEmail (adminaccount)', status: 'success' });
    console.log('✅ [TEST] Email de nuevo usuario adminaccount enviado');
  } catch (error) {
    results.push({ type: 'sendNewUserCreatedEmail (adminaccount)', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendNewUserCreatedEmail (adminaccount):', error.message);
  }
  
  // 10. Email de asociación a institución
  try {
    await emailServiceInstance.sendInstitutionAssociationEmail(
      testUserData,
      'Institución de Prueba',
      'División de Prueba',
      'familyadmin',
      {
        nombre: 'Estudiante',
        apellido: 'de Prueba',
        dni: '12345678'
      }
    );
    results.push({ type: 'sendInstitutionAssociationEmail', status: 'success' });
    console.log('✅ [TEST] Email de asociación a institución enviado');
  } catch (error) {
    results.push({ type: 'sendInstitutionAssociationEmail', status: 'error', error: error.message });
    console.error('❌ [TEST] Error en sendInstitutionAssociationEmail:', error.message);
  }
  
  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  
  console.log('\n📊 RESUMEN:');
  console.log(`✅ Exitosos: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
  console.log(`📧 Total: ${results.length}`);
  console.log('\n📋 Detalles:');
  results.forEach(r => {
    if (r.status === 'success') {
      console.log(`  ✅ ${r.type}`);
    } else {
      console.log(`  ❌ ${r.type}: ${r.error}`);
    }
  });
  
  process.exit(0);
}

testAllEmails().catch(error => {
  console.error('❌ Error general:', error);
  process.exit(1);
});

