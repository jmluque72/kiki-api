const AWS = require('aws-sdk');
require('dotenv').config({ path: './env.config' });

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

async function setupS3Bucket() {
  const bucketName = process.env.AWS_S3_BUCKET_NAME;
  
  try {
    console.log(`🔧 Configurando bucket "${bucketName}"...`);
    
    // 1. Configurar CORS
    const corsConfig = {
      CORSRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: ['*'],
          ExposeHeaders: []
        }
      ]
    };
    
    await s3.putBucketCors({
      Bucket: bucketName,
      CORSConfiguration: corsConfig
    }).promise();
    
    console.log('✅ CORS configurado correctamente');
    
    // 2. Configurar política de bucket para acceso público
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${bucketName}/*`
        }
      ]
    };
    
    await s3.putBucketPolicy({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    }).promise();
    
    console.log('✅ Política de bucket configurada correctamente');
    
    // 3. Deshabilitar bloqueo de ACLs (si es posible)
    try {
      await s3.putPublicAccessBlock({
        Bucket: bucketName,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false
        }
      }).promise();
      console.log('✅ Bloqueo de acceso público deshabilitado');
    } catch (error) {
      console.log('⚠️ No se pudo deshabilitar el bloqueo de ACLs:', error.message);
    }
    
    console.log('🎉 Bucket configurado correctamente');
    
  } catch (error) {
    console.error('❌ Error configurando bucket:', error.message);
  }
}

setupS3Bucket();
