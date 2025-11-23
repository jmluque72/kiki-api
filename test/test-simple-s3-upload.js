const AWS = require('aws-sdk');
require('dotenv').config({ path: './env.config' });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

async function testSimpleS3Upload() {
  try {
    console.log('📤 Probando upload directo a S3...');
    
    // Crear un archivo de prueba (1x1 pixel PNG)
    const testImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: 'uploads/test-image.png',
      Body: testImageBuffer,
      ContentType: 'image/png'
    };

    const result = await s3.upload(params).promise();
    
    console.log('✅ Upload exitoso:', result.Location);
    
    // Intentar descargar el archivo para verificar
    const downloadParams = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: 'uploads/test-image.png'
    };
    
    const downloadResult = await s3.getObject(downloadParams).promise();
    console.log('✅ Descarga exitosa, tamaño:', downloadResult.Body.length, 'bytes');
    
  } catch (error) {
    console.error('❌ Error en upload directo:', error.message);
  }
}

testSimpleS3Upload();
