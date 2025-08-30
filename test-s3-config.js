const AWS = require('aws-sdk');
require('dotenv').config({ path: './env.config' });

console.log('🔍 Verificando configuración de S3...');
console.log('📦 Bucket:', process.env.AWS_S3_BUCKET_NAME);
console.log('🌍 Región:', process.env.AWS_REGION);
console.log('🔑 Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado');
console.log('🔐 Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado');

// Crear instancia de S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

async function testS3Connection() {
  try {
    console.log('\n🔍 Probando conexión a S3...');
    
    // Listar buckets para verificar credenciales
    const buckets = await s3.listBuckets().promise();
    console.log('✅ Conexión a S3 exitosa');
    console.log('📦 Buckets disponibles:', buckets.Buckets.map(b => b.Name));
    
    // Verificar si el bucket específico existe
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const bucketExists = buckets.Buckets.some(b => b.Name === bucketName);
    
    if (bucketExists) {
      console.log(`✅ Bucket "${bucketName}" existe`);
      
      // Intentar listar objetos en el bucket
      try {
        const objects = await s3.listObjectsV2({
          Bucket: bucketName,
          MaxKeys: 5
        }).promise();
        console.log(`✅ Acceso al bucket "${bucketName}" exitoso`);
        console.log(`📁 Objetos en el bucket: ${objects.Contents?.length || 0}`);
      } catch (error) {
        console.log(`❌ Error accediendo al bucket "${bucketName}":`, error.message);
      }
    } else {
      console.log(`❌ Bucket "${bucketName}" no existe`);
      console.log('💡 Debes crear el bucket en AWS S3');
    }
    
  } catch (error) {
    console.error('❌ Error conectando a S3:', error.message);
  }
}

testS3Connection();
