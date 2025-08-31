const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testNotificationDeleteWithCoordinador() {
  try {
    console.log('🧪 [TEST NOTIFICATION DELETE WITH COORDINADOR] Probando eliminación con coordinador...\n');

    // 1. Intentar login con diferentes usuarios para encontrar un coordinador
    const testUsers = [
      { email: 'admin@kiki.com.ar', password: 'admin123', name: 'Admin' },
      { email: 'carlos.perez@email.com', password: 'password123', name: 'Carlos Perez' },
      { email: 'maria.garcia@email.com', password: 'password123', name: 'Maria Garcia' },
      { email: 'juan.lopez@email.com', password: 'password123', name: 'Juan Lopez' }
    ];

    let coordinadorUser = null;
    let coordinadorToken = null;

    for (const testUser of testUsers) {
      try {
        console.log(`🔍 Probando login con: ${testUser.email}`);
        const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
          email: testUser.email,
          password: testUser.password
        });

        const user = loginResponse.data.data.user;
        const token = loginResponse.data.data.token;
        
        console.log(`   Rol: ${user.role?.nombre}`);
        
        if (user.role?.nombre === 'coordinador') {
          coordinadorUser = user;
          coordinadorToken = token;
          console.log(`✅ ¡Encontrado coordinador: ${user.name}!`);
          break;
        }
      } catch (error) {
        console.log(`   ❌ Error con ${testUser.email}: ${error.response?.data?.message || error.message}`);
      }
    }

    if (!coordinadorUser) {
      console.log('❌ No se encontró ningún usuario con rol coordinador');
      console.log('🔧 Solución: Crear un usuario con rol coordinador o cambiar el rol de un usuario existente');
      return;
    }

    // 2. Obtener notificaciones del coordinador
    console.log('\n2️⃣ Obteniendo notificaciones...');
    const notificationsResponse = await axios.get(`${API_BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${coordinadorToken}` }
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
    console.log('   Usuario coordinador:', coordinadorUser.name);

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

    console.log('\n🎉 [TEST NOTIFICATION DELETE WITH COORDINADOR] ¡Prueba completada!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Usuario coordinador encontrado');
    console.log('   ✅ Notificaciones obtenidas');
    console.log('   ✅ Eliminación de notificación probada');
    console.log('   ✅ Verificación de eliminación completada');

  } catch (error) {
    console.error('\n❌ [TEST NOTIFICATION DELETE WITH COORDINADOR] Error:', error.message);
    
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
    console.log('   2. Crear un usuario con rol "coordinador"');
    console.log('   3. Verificar que existan notificaciones para eliminar');
    console.log('   4. Verificar la lógica de permisos en el endpoint DELETE');
  }
}

testNotificationDeleteWithCoordinador();
