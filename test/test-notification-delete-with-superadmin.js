const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testNotificationDeleteWithSuperadmin() {
  try {
    console.log('🧪 [TEST NOTIFICATION DELETE WITH SUPERADMIN] Probando eliminación con superadmin...\n');

    // 1. Login como superadmin
    console.log('1️⃣ Login como superadmin...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'admin@kiki.com.ar',
      password: 'admin123'
    });

    const superadminUser = loginResponse.data.data.user;
    const superadminToken = loginResponse.data.data.token;
    console.log('✅ Login exitoso como superadmin');
    console.log('   Usuario:', superadminUser.name);
    console.log('   Rol:', superadminUser.role.nombre);

    // 2. Obtener notificaciones del superadmin
    console.log('\n2️⃣ Obteniendo notificaciones...');
    const notificationsResponse = await axios.get(`${API_BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${superadminToken}` }
    });

    const notifications = notificationsResponse.data.data;
    console.log('✅ Notificaciones obtenidas:', notifications.length);

    if (notifications.length === 0) {
      console.log('⚠️ No hay notificaciones para probar eliminación');
      console.log('🔧 Solución: Crear algunas notificaciones primero');
      return;
    }

    // 3. Intentar eliminar la primera notificación
    const firstNotification = notifications[0];
    console.log('\n3️⃣ Intentando eliminar notificación...');
    console.log('   Notificación ID:', firstNotification._id);
    console.log('   Título:', firstNotification.title);
    console.log('   Remitente:', firstNotification.sender.nombre);
    console.log('   Usuario superadmin:', superadminUser.name);

    const deleteResponse = await axios.delete(
      `${API_BASE_URL}/api/notifications/${firstNotification._id}`,
      {
        headers: { Authorization: `Bearer ${superadminToken}` }
      }
    );

    if (deleteResponse.data.success) {
      console.log('✅ Notificación eliminada exitosamente');
      console.log('   Mensaje:', deleteResponse.data.message);
    } else {
      console.log('❌ Error al eliminar notificación');
      console.log('   Mensaje:', deleteResponse.data.message);
    }

    // 4. Verificar que la notificación ya no existe
    console.log('\n4️⃣ Verificando que la notificación fue eliminada...');
    try {
      const verifyResponse = await axios.get(`${API_BASE_URL}/api/notifications`, {
        headers: { Authorization: `Bearer ${superadminToken}` }
      });
      
      const remainingNotifications = verifyResponse.data.data;
      const notificationStillExists = remainingNotifications.some(n => n._id === firstNotification._id);
      
      if (!notificationStillExists) {
        console.log('✅ Notificación eliminada correctamente del sistema');
      } else {
        console.log('❌ La notificación aún existe en el sistema');
      }
    } catch (error) {
      console.log('❌ Error al verificar eliminación:', error.message);
    }

    console.log('\n🎉 [TEST NOTIFICATION DELETE WITH SUPERADMIN] ¡Prueba completada!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login como superadmin exitoso');
    console.log('   ✅ Notificaciones obtenidas');
    console.log('   ✅ Eliminación de notificación probada');
    console.log('   ✅ Verificación de eliminación completada');

  } catch (error) {
    console.error('\n❌ [TEST NOTIFICATION DELETE WITH SUPERADMIN] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      
      if (error.response.status === 403) {
        console.log('\n🔧 Problema de permisos detectado:');
        console.log('   - El usuario no tiene permisos para eliminar notificaciones');
        console.log('   - Verificar que el rol sea "superadmin"');
        console.log('   - Verificar la lógica de permisos en el backend');
      }
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo');
    console.log('   2. Verificar que el usuario tenga rol "superadmin"');
    console.log('   3. Verificar que existan notificaciones para eliminar');
    console.log('   4. Verificar la lógica de permisos en el endpoint DELETE');
  }
}

testNotificationDeleteWithSuperadmin();
