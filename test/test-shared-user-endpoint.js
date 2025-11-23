const axios = require('axios');

async function testSharedUserEndpoint() {
  console.log('🧪 [TEST ENDPOINT] ===== PROBANDO ENDPOINT /shared/user =====');
  
  try {
    // Primero necesitamos hacer login para obtener el token
    console.log('🔐 [TEST ENDPOINT] Haciendo login...');
    const loginResponse = await axios.post('http://localhost:3000/users/login', {
      email: 'coordinador1@kiki.com',
      password: 'coordinador1@kiki.com'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ [TEST ENDPOINT] Login exitoso, token obtenido');
    
    // Ahora llamar al endpoint /shared/user
    console.log('📡 [TEST ENDPOINT] Llamando a /shared/user...');
    const userResponse = await axios.get('http://localhost:3000/shared/user', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ [TEST ENDPOINT] Respuesta del endpoint /shared/user');
    console.log('📊 [TEST ENDPOINT] Status:', userResponse.status);
    console.log('📊 [TEST ENDPOINT] Datos recibidos:', {
      associations: userResponse.data.associations?.length || 0,
      hasAssociations: !!userResponse.data.associations
    });
    
    // Revisar las asociaciones y sus avatares
    if (userResponse.data.associations && userResponse.data.associations.length > 0) {
      console.log('🔍 [TEST ENDPOINT] ===== REVISANDO AVATARES DE ESTUDIANTES =====');
      userResponse.data.associations.forEach((assoc, index) => {
        console.log(`📦 [TEST ENDPOINT] Asociación ${index + 1}:`, {
          id: assoc._id,
          studentId: assoc.student?._id,
          studentName: assoc.student?.nombre,
          studentAvatar: assoc.student?.avatar,
          hasAvatar: !!assoc.student?.avatar,
          avatarType: assoc.student?.avatar ? (assoc.student.avatar.startsWith('http') ? 'URL completa' : 'Key de S3') : 'Sin avatar'
        });
      });
    }
    
  } catch (error) {
    console.error('❌ [TEST ENDPOINT] Error:', error.message);
    if (error.response) {
      console.error('❌ [TEST ENDPOINT] Status:', error.response.status);
      console.error('❌ [TEST ENDPOINT] Data:', error.response.data);
    }
  }
}

testSharedUserEndpoint();
