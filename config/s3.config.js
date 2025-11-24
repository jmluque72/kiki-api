const AWS = require('aws-sdk');
const multerS3 = require('multer-s3');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Configuración de AWS S3
const s3Config = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  bucketName: process.env.AWS_S3_BUCKET_NAME
};

// Crear instancia de S3 usando AWS SDK v2 (compatible con multer-s3)
const s3 = new AWS.S3({
  accessKeyId: s3Config.accessKeyId,
  secretAccessKey: s3Config.secretAccessKey,
  region: s3Config.region
});

// Configuración de multer-s3
const multerS3Config = {
  s3: s3,
  bucket: s3Config.bucketName,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    // Generar nombre único para el archivo
    const fileExtension = file.mimetype.split('/')[1];
    const fileName = `${uuidv4()}.${fileExtension}`;
    cb(null, `uploads/${fileName}`);
  }
};

// Función para generar URL firmada de S3
const generateSignedUrl = async (key, expiresIn = 172800) => { // 2 días = 172800 segundos
  console.log('🔗 [S3 CONFIG] ===== GENERANDO URL FIRMADA =====');
  console.log('🔗 [S3 CONFIG] Key recibida:', key);
  console.log('🔗 [S3 CONFIG] Expires in:', expiresIn, 'segundos');
  console.log('🔗 [S3 CONFIG] Bucket name:', s3Config.bucketName);
  console.log('🔗 [S3 CONFIG] Region:', s3Config.region);
  
  if (!key) {
    console.log('❌ [S3 CONFIG] Key es null o undefined');
    return null;
  }
  
  try {
    console.log('🔗 [S3 CONFIG] Generando URL firmada...');
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: s3Config.bucketName,
      Key: key,
      Expires: expiresIn
    });
    
    console.log('✅ [S3 CONFIG] URL firmada generada exitosamente');
    console.log('🔗 [S3 CONFIG] URL firmada:', signedUrl);
    console.log('🔗 [S3 CONFIG] Longitud de URL:', signedUrl ? signedUrl.length : 'null');
    console.log('🔗 [S3 CONFIG] Tipo de URL:', typeof signedUrl);
    
    return signedUrl;
  } catch (error) {
    console.error('❌ [S3 CONFIG] Error generando URL firmada:', error);
    console.error('❌ [S3 CONFIG] Error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      name: error.name
    });
    return null;
  }
};

// Función para generar URL firmada para múltiples imágenes
const generateSignedUrls = async (keys, expiresIn = 172800) => { // 2 días = 172800 segundos
  if (!Array.isArray(keys)) return [];
  
  const results = [];
  for (const key of keys) {
    const signedUrl = await generateSignedUrl(key, expiresIn);
    if (signedUrl) {
      results.push({
        key: key,
        signedUrl: signedUrl
      });
    }
  }
  return results;
};

// Función para generar URL pública de S3 (para emails - no expira)
// Asume que el bucket tiene objetos públicos o CloudFront configurado
const getPublicUrl = (key) => {
  if (!key) return null;
  
  // Si ya es una URL completa, retornarla
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }
  
  // Generar URL pública de S3
  // Formato: https://bucket-name.s3.region.amazonaws.com/key
  // O si hay CloudFront: https://cloudfront-domain.com/key
  const cloudfrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN;
  
  if (cloudfrontDomain) {
    // Usar CloudFront si está configurado (mejor para emails)
    return `https://${cloudfrontDomain}/${key}`;
  } else {
    // Usar URL directa de S3 (requiere que el objeto sea público)
    const region = s3Config.region || 'us-east-1';
    const bucketName = s3Config.bucketName;
    return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
  }
};

module.exports = {
  s3,
  s3Config,
  multerS3Config,
  generateSignedUrl,
  generateSignedUrls,
  getPublicUrl
};
