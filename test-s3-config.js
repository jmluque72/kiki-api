const AWS = require('aws-sdk');
require('dotenv').config();

async function testS3Config() {
  console.log('🔍 [TEST S3 CONFIG] Verificando configuración de S3...\n');

  // 1. Verificar variables de entorno
  console.log('1️⃣ Verificando variables de entorno...');
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? 'Configurado' : 'No configurado'}`);
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? 'Configurado' : 'No configurado'}`);
  console.log(`   AWS_REGION: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`   AWS_S3_BUCKET_NAME: ${process.env.AWS_S3_BUCKET_NAME || 'No configurado'}`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET_NAME) {
    console.log('❌ Variables de entorno de S3 no configuradas correctamente');
    return;
  }

  // 2. Crear instancia de S3
  console.log('\n2️⃣ Creando instancia de S3...');
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });

  console.log('✅ Instancia de S3 creada');

  // 3. Verificar acceso al bucket
  console.log('\n3️⃣ Verificando acceso al bucket...');
  try {
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const result = await s3.headBucket({ Bucket: bucketName }).promise();
    console.log(`✅ Acceso al bucket ${bucketName} verificado`);
  } catch (error) {
    console.log(`❌ Error accediendo al bucket: ${error.message}`);
    return;
  }

  // 4. Probar subida de archivo de prueba
  console.log('\n4️⃣ Probando subida de archivo de prueba...');
  try {
    const testKey = `test/avatar-test-${Date.now()}.txt`;
    const testContent = 'Este es un archivo de prueba para verificar S3';
    
    const uploadResult = await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain'
    }).promise();

    console.log('✅ Archivo de prueba subido exitosamente');
    console.log(`   Key: ${testKey}`);
    console.log(`   Location: ${uploadResult.Location}`);

    // 5. Verificar que el archivo existe
    console.log('\n5️⃣ Verificando que el archivo existe...');
    const headResult = await s3.headObject({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: testKey
    }).promise();

    console.log('✅ Archivo verificado en S3');
    console.log(`   Tamaño: ${headResult.ContentLength} bytes`);
    console.log(`   Content-Type: ${headResult.ContentType}`);

    // 6. Generar URL firmada
    console.log('\n6️⃣ Generando URL firmada...');
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: testKey,
      Expires: 3600
    });

    console.log('✅ URL firmada generada');
    console.log(`   URL: ${signedUrl}`);

    // 7. Eliminar archivo de prueba
    console.log('\n7️⃣ Eliminando archivo de prueba...');
    await s3.deleteObject({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: testKey
    }).promise();

    console.log('✅ Archivo de prueba eliminado');

    // 8. Resumen final
    console.log('\n8️⃣ Resumen final:');
    console.log('=' .repeat(50));
    console.log('🎉 ¡ÉXITO! La configuración de S3 está funcionando correctamente');
    console.log('✅ Las credenciales son válidas');
    console.log('✅ El bucket es accesible');
    console.log('✅ Se pueden subir archivos');
    console.log('✅ Se pueden generar URLs firmadas');
    console.log('✅ El sistema está listo para Docker');

  } catch (error) {
    console.log(`❌ Error en prueba de S3: ${error.message}`);
    console.log('💡 Posibles causas:');
    console.log('   1. Credenciales de AWS incorrectas');
    console.log('   2. Bucket no existe o no es accesible');
    console.log('   3. Permisos insuficientes');
    console.log('   4. Región incorrecta');
  }
}

testS3Config();
