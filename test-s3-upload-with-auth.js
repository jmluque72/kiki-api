const axios = require('axios');
const FormData = require('form-data');

const API_BASE_URL = 'http://localhost:3000/api';

// Función para hacer login y obtener token
async function login() {
  try {
    const response = await axios.post(`${API_BASE_URL}/users/login`, {
      email: 'coordinador@test.com',
      password: 'password123'
    });

    return response.data.data.token;
  } catch (error) {
    console.error('Error al hacer login:', error.response?.data || error.message);
    throw error;
  }
}

// Función para probar el endpoint S3 con autenticación
async function testS3UploadWithAuth() {
  try {
    console.log('🔐 Iniciando login...');
    const token = await login();
    console.log('✅ Login exitoso, token obtenido');

    // Crear un archivo de prueba (1x1 pixel PNG)
    const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    const formData = new FormData();
    formData.append('image', testImageBuffer, {
      filename: 'test.png',
      contentType: 'image/png'
    });

    console.log('📤 Probando endpoint S3 con autenticación...');
    const response = await axios.post(`${API_BASE_URL}/upload/s3/image`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      }
    });

    console.log('✅ Respuesta del endpoint S3:', response.data);
    return response.data;

  } catch (error) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
    throw error;
  }
}

// Ejecutar prueba
testS3UploadWithAuth()
  .then(() => {
    console.log('🎉 Prueba completada exitosamente');
  })
  .catch((error) => {
    console.error('💥 Prueba falló:', error.message);
  });
