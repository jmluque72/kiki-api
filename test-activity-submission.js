const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

// Datos de prueba
const testUser = {
  email: 'test@kiki.ar',
  password: 'test123'
};

const testActivity = {
  titulo: 'Actividad de prueba',
  participantes: 'Alumnos del grupo A',
  descripcion: 'Esta es una actividad de prueba creada desde la app móvil',
  imagenes: [],
  accountId: null, // Se llenará después del login
  divisionId: null, // Se llenará después del login
  userId: null // Se llenará después del login
};

async function testActivitySubmission() {
  try {
    console.log('🧪 Iniciando prueba de envío de actividades...\n');

    // 1. Login para obtener token
    console.log('1️⃣ Haciendo login...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: testUser.email,
      password: testUser.password
    });

    if (!loginResponse.data.success) {
      throw new Error('Login falló: ' + loginResponse.data.message);
    }

    const { token, user } = loginResponse.data;
    console.log('✅ Login exitoso');
    console.log(`   Usuario: ${user.name}`);
    console.log(`   Token: ${token.substring(0, 20)}...`);

    // 2. Obtener asociaciones del usuario
    console.log('\n2️⃣ Obteniendo asociaciones del usuario...');
    const associationsResponse = await axios.get(`${API_BASE_URL}/api/users/associations`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!associationsResponse.data.success) {
      throw new Error('Error obteniendo asociaciones: ' + associationsResponse.data.message);
    }

    const associations = associationsResponse.data.associations;
    console.log(`✅ Encontradas ${associations.length} asociaciones`);

    if (associations.length === 0) {
      throw new Error('El usuario no tiene asociaciones activas');
    }

    // Usar la primera asociación activa
    const activeAssociation = associations.find(assoc => assoc.status === 'active');
    if (!activeAssociation) {
      throw new Error('No hay asociaciones activas');
    }

    testActivity.accountId = activeAssociation.account._id;
    testActivity.divisionId = activeAssociation.division?._id;
    testActivity.userId = user._id;

    console.log(`   Cuenta: ${activeAssociation.account.nombre}`);
    console.log(`   División: ${activeAssociation.division?.nombre || 'Sin división'}`);

    // 3. Crear un archivo de imagen de prueba
    console.log('\n3️⃣ Creando imagen de prueba...');
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    const testImageBuffer = Buffer.from('fake-image-data');
    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('✅ Imagen de prueba creada');

    // 4. Subir imagen
    console.log('\n4️⃣ Subiendo imagen...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-image.jpg',
      contentType: 'image/jpeg'
    });

    const uploadResponse = await axios.post(`${API_BASE_URL}/api/upload-image`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    if (!uploadResponse.data.success) {
      throw new Error('Error subiendo imagen: ' + uploadResponse.data.message);
    }

    const imageUrl = uploadResponse.data.imageUrl;
    console.log('✅ Imagen subida exitosamente');
    console.log(`   URL: ${imageUrl}`);

    // 5. Crear actividad con imagen
    console.log('\n5️⃣ Creando actividad...');
    testActivity.imagenes = [imageUrl];

    const activityResponse = await axios.post(`${API_BASE_URL}/api/activities`, testActivity, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!activityResponse.data.success) {
      throw new Error('Error creando actividad: ' + activityResponse.data.message);
    }

    console.log('✅ Actividad creada exitosamente');
    console.log(`   ID: ${activityResponse.data.activity._id}`);
    console.log(`   Título: ${activityResponse.data.activity.titulo}`);

    // 6. Limpiar archivo de prueba
    fs.unlinkSync(testImagePath);
    console.log('\n🧹 Archivo de prueba eliminado');

    console.log('\n🎉 ¡Todas las pruebas pasaron exitosamente!');
    console.log('\n📋 Resumen:');
    console.log('   ✅ Login exitoso');
    console.log('   ✅ Asociaciones obtenidas');
    console.log('   ✅ Imagen subida');
    console.log('   ✅ Actividad creada');
    console.log('   ✅ Limpieza completada');

  } catch (error) {
    console.error('\n❌ Error en las pruebas:', error.message);
    if (error.response) {
      console.error('   Detalles:', error.response.data);
    }
    process.exit(1);
  }
}

// Ejecutar pruebas
testActivitySubmission(); 