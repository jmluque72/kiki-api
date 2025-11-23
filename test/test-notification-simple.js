const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testNotificationSimple() {
  try {
    console.log('🧪 [TEST NOTIFICATION SIMPLE] Probando creación de notificaciones...\n');

    // 1. Login como superadmin
    console.log('1️⃣ Login como superadmin...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    const user = loginResponse.data.data.user;
    const token = loginResponse.data.data.token;
    console.log('✅ Login exitoso');
    console.log('   Usuario:', user.name);
    console.log('   Rol:', user.role.nombre);

    // 2. Crear notificación simple
    console.log('\n2️⃣ Creando notificación simple...');
    
    const notificationData = {
      title: 'Notificación de Prueba Simple',
      message: 'Esta es una notificación de prueba para verificar que el sistema funciona.',
      type: 'informacion',
      accountId: '68b2ee9200275a95ffec52c3', // ID de cuenta de ejemplo
      recipients: [] // Sin destinatarios por ahora
    };

    console.log('📋 Datos de la notificación:');
    console.log('   Título:', notificationData.title);
    console.log('   Mensaje:', notificationData.message);
    console.log('   Tipo:', notificationData.type);
    console.log('   Destinatarios:', notificationData.recipients.length);

    const createResponse = await axios.post(
      `${API_BASE_URL}/api/notifications`,
      notificationData,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (createResponse.data.success) {
      console.log('✅ Notificación creada exitosamente');
      console.log('   ID de notificación:', createResponse.data.data.id);
      console.log('   Mensaje:', createResponse.data.message);
    } else {
      console.log('❌ Error al crear notificación');
      console.log('   Mensaje:', createResponse.data.message);
    }

    // 3. Verificar que la notificación se guardó correctamente
    console.log('\n3️⃣ Verificando que la notificación se guardó correctamente...');
    const notificationsResponse = await axios.get(`${API_BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const notifications = notificationsResponse.data.data;
    const createdNotification = notifications.find(n => n.title === notificationData.title);
    
    if (createdNotification) {
      console.log('✅ Notificación encontrada en la base de datos');
      console.log('   ID:', createdNotification._id);
      console.log('   Título:', createdNotification.title);
      console.log('   Remitente:', createdNotification.sender.nombre);
      console.log('   Destinatarios guardados:', createdNotification.recipients.length);
      console.log('   IDs de destinatarios:', createdNotification.recipients);
    } else {
      console.log('❌ La notificación no se encontró en la base de datos');
    }

    console.log('\n🎉 [TEST NOTIFICATION SIMPLE] ¡Prueba completada!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Notificación creada');
    console.log('   ✅ Verificación de guardado completada');

  } catch (error) {
    console.error('\n❌ [TEST NOTIFICATION SIMPLE] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo');
    console.log('   2. Verificar que el usuario tenga permisos para la cuenta');
    console.log('   3. Verificar que el endpoint /api/notifications esté funcionando');
  }
}

testNotificationSimple();
