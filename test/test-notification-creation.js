const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testNotificationCreation() {
  try {
    console.log('🧪 [TEST NOTIFICATION CREATION] Probando creación de notificaciones...\n');

    // 1. Login como coordinador o superadmin
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

    // 2. Obtener estudiantes disponibles
    console.log('\n2️⃣ Obteniendo estudiantes disponibles...');
    const studentsResponse = await axios.get(`${API_BASE_URL}/api/students`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        accountId: '68b2ee9200275a95ffec52c3', // ID de cuenta de ejemplo
        divisionId: '68b2ee9200275a95ffec52c4', // ID de división de ejemplo
        limit: 5
      }
    });

    const students = studentsResponse.data.data.students || [];
    console.log('✅ Estudiantes obtenidos:', students.length);

    if (students.length === 0) {
      console.log('⚠️ No hay estudiantes disponibles para la prueba');
      return;
    }

    // Mostrar algunos estudiantes
    students.slice(0, 3).forEach((student, index) => {
      console.log(`   ${index + 1}. ${student.nombre} ${student.apellido} (${student._id})`);
    });

    // 3. Crear notificación con estudiantes seleccionados
    console.log('\n3️⃣ Creando notificación con estudiantes seleccionados...');
    
    // Seleccionar los primeros 2 estudiantes
    const selectedStudentIds = students.slice(0, 2).map(student => student._id);
    
    const notificationData = {
      title: 'Notificación de Prueba',
      message: 'Esta es una notificación de prueba para verificar que los estudiantes se guardan correctamente.',
      type: 'informacion',
      accountId: '68b2ee9200275a95ffec52c3', // ID de cuenta de ejemplo
      divisionId: '68b2ee9200275a95ffec52c4', // ID de división de ejemplo
      recipients: selectedStudentIds
    };

    console.log('📋 Datos de la notificación:');
    console.log('   Título:', notificationData.title);
    console.log('   Mensaje:', notificationData.message);
    console.log('   Tipo:', notificationData.type);
    console.log('   Estudiantes seleccionados:', selectedStudentIds.length);
    console.log('   IDs de estudiantes:', selectedStudentIds);

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

    // 4. Verificar que la notificación se guardó correctamente
    console.log('\n4️⃣ Verificando que la notificación se guardó correctamente...');
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
      
      // Verificar que los estudiantes seleccionados están en la lista
      const allRecipientsFound = selectedStudentIds.every(id => 
        createdNotification.recipients.includes(id)
      );
      
      if (allRecipientsFound) {
        console.log('✅ Todos los estudiantes seleccionados fueron guardados correctamente');
      } else {
        console.log('❌ Algunos estudiantes no fueron guardados correctamente');
        console.log('   Esperados:', selectedStudentIds);
        console.log('   Guardados:', createdNotification.recipients);
      }
    } else {
      console.log('❌ La notificación no se encontró en la base de datos');
    }

    console.log('\n🎉 [TEST NOTIFICATION CREATION] ¡Prueba completada!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Estudiantes obtenidos');
    console.log('   ✅ Notificación creada');
    console.log('   ✅ Verificación de guardado completada');

  } catch (error) {
    console.error('\n❌ [TEST NOTIFICATION CREATION] Error:', error.message);
    
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    console.log('\n🔧 Posibles soluciones:');
    console.log('   1. Verificar que el servidor esté corriendo');
    console.log('   2. Verificar que existan estudiantes en la base de datos');
    console.log('   3. Verificar que el usuario tenga permisos para la cuenta');
    console.log('   4. Verificar que el endpoint /api/notifications esté funcionando');
  }
}

testNotificationCreation();
