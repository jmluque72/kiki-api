const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'http://localhost:3000';

async function testUploadSystem() {
  try {
    console.log('🧪 Probando sistema de uploads...\n');

    // 1. Login como admin
    console.log('1️⃣ Login como admin...');
    const adminLogin = await axios.post(`${API_BASE_URL}/api/users/login`, {
      email: 'test@kiki.ar',
      password: 'admin123'
    });

    if (!adminLogin.data.success) {
      console.log('❌ Error en login:', adminLogin.data.message);
      return;
    }

    console.log('✅ Admin logueado exitosamente');
    const adminToken = adminLogin.data.data.token;
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'multipart/form-data'
    };

    // 2. Crear archivo de prueba
    console.log('2️⃣ Creando archivo de prueba...');
    const testImagePath = path.join(__dirname, 'test-image.png');
    
    // Crear una imagen PNG simple (1x1 pixel transparente)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, // bit depth
      0x02, // color type (RGB)
      0x00, // compression
      0x00, // filter
      0x00, // interlace
      0x00, 0x00, 0x00, 0x00, // CRC placeholder
      0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
      0x49, 0x44, 0x41, 0x54, // IDAT
      0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
      0x00, 0x00, 0x00, 0x00, // CRC placeholder
      0x00, 0x00, 0x00, 0x00, // IEND chunk length
      0x49, 0x45, 0x4E, 0x44, // IEND
      0xAE, 0x42, 0x60, 0x82  // CRC
    ]);
    
    fs.writeFileSync(testImagePath, pngHeader);

    // 3. Probar upload de un solo archivo
    console.log('3️⃣ Probando upload de un solo archivo...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testImagePath));

    try {
      const uploadResponse = await axios.post(`${API_BASE_URL}/api/upload/single`, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (uploadResponse.data.success) {
        console.log('✅ Upload exitoso');
        console.log(`📁 Archivo: ${uploadResponse.data.data.filename}`);
        console.log(`🔗 URL: ${uploadResponse.data.data.url}`);
        console.log(`📏 Tamaño: ${uploadResponse.data.data.size} bytes`);
        
        // 4. Probar obtener información del archivo
        console.log('4️⃣ Probando obtener información del archivo...');
        const infoResponse = await axios.get(`${API_BASE_URL}/api/upload/info/${uploadResponse.data.data.filename}`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (infoResponse.data.success) {
          console.log('✅ Información obtenida');
          console.log(`📁 Archivo: ${infoResponse.data.data.filename}`);
          console.log(`🔗 URL: ${infoResponse.data.data.url}`);
          console.log(`📏 Tamaño: ${infoResponse.data.data.size} bytes`);
        }

        // 5. Probar eliminar archivo
        console.log('5️⃣ Probando eliminar archivo...');
        const deleteResponse = await axios.delete(`${API_BASE_URL}/api/upload/${uploadResponse.data.data.filename}`, {
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (deleteResponse.data.success) {
          console.log('✅ Archivo eliminado exitosamente');
        }
      } else {
        console.log('❌ Error en upload:', uploadResponse.data.message);
      }
    } catch (error) {
      console.log('❌ Error en upload:', error.response?.data || error.message);
    }

    // 6. Limpiar archivo de prueba
    console.log('6️⃣ Limpiando archivo de prueba...');
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
      console.log('✅ Archivo de prueba eliminado');
    }

    console.log('\n🎉 Pruebas de upload completadas');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testUploadSystem(); 