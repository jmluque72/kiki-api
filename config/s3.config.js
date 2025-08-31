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
const generateSignedUrl = async (key, expiresIn = 3600) => {
  if (!key) return null;
  
  try {
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: s3Config.bucketName,
      Key: key,
      Expires: expiresIn
    });
    return signedUrl;
  } catch (error) {
    console.error('Error generando URL firmada:', error);
    return null;
  }
};

// Función para generar URL firmada para múltiples imágenes
const generateSignedUrls = async (keys, expiresIn = 3600) => {
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

module.exports = {
  s3,
  s3Config,
  multerS3Config,
  generateSignedUrl,
  generateSignedUrls
};
