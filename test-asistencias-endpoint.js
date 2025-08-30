const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function testAsistenciasEndpoints() {
  try {
    console.log('🧪 Probando endpoints de asistencias...\n');

    // 1. Login como test@kiki.ar
    console.log('1️⃣ Login como test@kiki.ar...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (!loginResponse.data.success) {
      console.log('❌ Error en login:', loginResponse.data.message);
      return;
    }

    const token = loginResponse.data.data.token;
    const user = loginResponse.data.data.user;
    console.log('✅ Login exitoso');
    console.log(`👤 Usuario: ${user.nombre} (${user.email})`);
    console.log(`🔑 Rol: ${user.role.nombre}`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log('');

    // Configurar headers
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Obtener grupos para usar en las pruebas
    console.log('2️⃣ Obteniendo grupos disponibles...');
    const gruposResponse = await axios.get(`${API_BASE_URL}/api/grupos`, { headers });
    
    if (!gruposResponse.data.success || gruposResponse.data.data.grupos.length === 0) {
      console.log('❌ No se encontraron grupos para las pruebas');
      return;
    }

    const grupo = gruposResponse.data.data.grupos[0];
    console.log(`✅ Grupo encontrado: ${grupo.nombre} (${grupo._id})`);
    console.log('');

    // 3. Probar listar asistencias
    console.log('3️⃣ Probando listar asistencias...');
    try {
      const asistenciasResponse = await axios.get(`${API_BASE_URL}/api/asistencias`, { headers });
      console.log('✅ Asistencias obtenidas exitosamente');
      console.log(`📊 Total asistencias: ${asistenciasResponse.data.data.total}`);
      console.log(`📄 Página: ${asistenciasResponse.data.data.page}`);
      console.log(`📏 Límite: ${asistenciasResponse.data.data.limit}`);
      
      if (asistenciasResponse.data.data.asistencias.length > 0) {
        console.log('📋 Asistencias encontradas:');
        asistenciasResponse.data.data.asistencias.slice(0, 3).forEach((asistencia, index) => {
          console.log(`   ${index + 1}. ${asistencia.alumno.name} - ${asistencia.estado}`);
          console.log(`      Fecha: ${new Date(asistencia.fecha).toLocaleDateString()}`);
          console.log(`      Grupo: ${asistencia.grupo.nombre}`);
          console.log('');
        });
      } else {
        console.log('📭 No se encontraron asistencias');
      }
    } catch (error) {
      console.log('❌ Error obteniendo asistencias:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 4. Probar crear una asistencia
    console.log('4️⃣ Probando crear asistencia...');
    const nuevaAsistencia = {
      alumnoId: user._id, // Usar el usuario actual como alumno
      accountId: grupo.cuenta._id,
      grupoId: grupo._id,
      fecha: new Date().toISOString(),
      estado: 'presente',
      horaLlegada: new Date().toISOString(),
      observaciones: 'Asistencia de prueba creada automáticamente'
    };

    try {
      const createResponse = await axios.post(`${API_BASE_URL}/api/asistencias`, nuevaAsistencia, { headers });
      console.log('✅ Asistencia creada exitosamente');
      console.log(`📋 ID: ${createResponse.data.data._id}`);
      console.log(`👤 Alumno: ${createResponse.data.data.alumno.name}`);
      console.log(`📅 Fecha: ${new Date(createResponse.data.data.fecha).toLocaleDateString()}`);
      console.log(`✅ Estado: ${createResponse.data.data.estado}`);
      console.log('');
    } catch (error) {
      console.log('❌ Error creando asistencia:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
      if (error.response?.data) {
        console.log('   Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // 5. Probar actualizar una asistencia
    console.log('5️⃣ Probando actualizar asistencia...');
    try {
      // Primero obtener las asistencias para tener un ID válido
      const asistenciasResponse = await axios.get(`${API_BASE_URL}/api/asistencias`, { headers });
      
      if (asistenciasResponse.data.data.asistencias.length > 0) {
        const asistenciaToUpdate = asistenciasResponse.data.data.asistencias[0];
        
        const updateData = {
          estado: 'tardanza',
          observaciones: 'Asistencia actualizada desde prueba'
        };

        const updateResponse = await axios.put(
          `${API_BASE_URL}/api/asistencias/${asistenciaToUpdate._id}`, 
          updateData, 
          { headers }
        );
        
        console.log('✅ Asistencia actualizada exitosamente');
        console.log(`📋 ID: ${updateResponse.data.data._id}`);
        console.log(`✅ Nuevo estado: ${updateResponse.data.data.estado}`);
        console.log(`📝 Observaciones: ${updateResponse.data.data.observaciones}`);
        console.log('');
      } else {
        console.log('📭 No hay asistencias para actualizar');
      }
    } catch (error) {
      console.log('❌ Error actualizando asistencia:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    // 6. Probar eliminar una asistencia
    console.log('6️⃣ Probando eliminar asistencia...');
    try {
      const asistenciasResponse = await axios.get(`${API_BASE_URL}/api/asistencias`, { headers });
      
      if (asistenciasResponse.data.data.asistencias.length > 0) {
        const asistenciaToDelete = asistenciasResponse.data.data.asistencias[0];
        
        const deleteResponse = await axios.delete(
          `${API_BASE_URL}/api/asistencias/${asistenciaToDelete._id}`, 
          { headers }
        );
        
        console.log('✅ Asistencia eliminada exitosamente');
        console.log(`📋 ID: ${asistenciaToDelete._id}`);
        console.log('');
      } else {
        console.log('📭 No hay asistencias para eliminar');
      }
    } catch (error) {
      console.log('❌ Error eliminando asistencia:');
      console.log('   Status:', error.response?.status);
      console.log('   Message:', error.response?.data?.message || error.message);
    }

    console.log('🎉 Pruebas de asistencias completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar la prueba
testAsistenciasEndpoints(); 