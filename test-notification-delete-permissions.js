const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testNotificationDeletePermissions() {
  try {
    console.log('🧪 [TEST NOTIFICATION DELETE PERMISSIONS] Probando permisos de eliminación...\n');

    // 1. Login como coordinador
    console.log('1️⃣ Login como coordinador...');
    const coordinadorLoginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'carlos.perez@email.com',
      password: 'password123'
    });

    const coordinadorToken = coordinadorLoginResponse.data.data.token;
    const coordinadorUser = coordinadorLoginResponse.data.data.user;
    console.log('✅ Login exitoso como coordinador');
    console.log('   Usuario:', coordinadorUser.name);
    console.log('   Rol:', coordinadorUser.role.nombre);

    // 2. Obtener notificaciones del coordinador
    console.log('\n2️⃣ Obteniendo notificaciones...');
    const notificationsResponse = await axios.get(`${API_BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${coordinadorToken}` }
    });

    const notifications = notificationsResponse.data.data;
    console.log('✅ Notificaciones obtenidas:', notifications.length);

    if (notifications.length === 0) {
      console.log('⚠️ No hay notificaciones para probar eliminación');
      return;
    }

    // 3. Intentar eliminar la primera notificación
    const firstNotification = notifications[0];
    console.log('\n3️⃣ Intentando eliminar notificación...');
    console.log('   Notificación ID:', firstNotification._id);
    console.log('   Título:', firstNotification.title);
    console.log('   Remitente:', firstNotification.sender.nombre);

    const deleteResponse = await axios.delete(
      `${API_BASE_URL}/api/notifications/${firstNotification._id}`,
      {
        headers: { Authorization: `Bearer ${coordinadorToken}` }
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
        headers: { Authorization: `Bearer ${coordinadorToken}` }
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

    console.log('\n🎉 [TEST NOTIFICATION DELETE PERMISSIONS] ¡Prueba completada!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login como coordinador exitoso');
    console.log('   ✅ Notificaciones obtenidas');
    console.log('   ✅ Eliminación de notificación probada');
    console.log('   ✅ Verificación de eliminación completada');

  } catch (error) {
    console.error('\n❌ [TEST NOTIFICATION DELETE PERMISSIONS] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
      
      if (error.response.status === 403) {
        console.log('\n🔧 Problema de permisos detectado:');
        console.log('   - El usuario no tiene permisos para eliminar notificaciones');
        console.log('   - Verificar que el rol sea "coordinador"');
        console.log('   - Verificar la lógica de permisos en el backend');
      }
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo');
    console.log('   2. Verificar que el usuario tenga rol "coordinador"');
    console.log('   3. Verificar que existan notificaciones para eliminar');
    console.log('   4. Verificar la lógica de permisos en el endpoint DELETE');
  }
}

testNotificationDeletePermissions();
