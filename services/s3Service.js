const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Configurar AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'kiki-documents';

/**
 * Subir archivo a S3
 * @param {Object} file - Archivo de multer
 * @param {string} folder - Carpeta en S3
 * @returns {Promise<Object>} - Resultado de la subida
 */
const uploadToS3 = async (file, folder = 'documents') => {
  try {
    const fileContent = fs.readFileSync(file.path);
    const fileName = `${folder}/${Date.now()}-${file.originalname}`;
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: file.mimetype
    };

    const result = await s3.upload(params).promise();
    
    console.log(`✅ Archivo subido a S3: ${result.Location}`);
    return result;
  } catch (error) {
    console.error('❌ Error subiendo archivo a S3:', error);
    throw error;
  }
};

/**
 * Eliminar archivo de S3
 * @param {string} key - Clave del archivo en S3
 * @returns {Promise<Object>} - Resultado de la eliminación
 */
const deleteFromS3 = async (key) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    const result = await s3.deleteObject(params).promise();
    
    console.log(`✅ Archivo eliminado de S3: ${key}`);
    return result;
  } catch (error) {
    console.error('❌ Error eliminando archivo de S3:', error);
    throw error;
  }
};

/**
 * Generar URL firmada para descarga
 * @param {string} key - Clave del archivo en S3
 * @param {number} expiresIn - Tiempo de expiración en segundos (default: 3600)
 * @returns {string} - URL firmada
 */
const getSignedUrl = (key, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: expiresIn
    };

    return s3.getSignedUrl('getObject', params);
  } catch (error) {
    console.error('❌ Error generando URL firmada:', error);
    throw error;
  }
};

/**
 * Listar archivos en S3
 * @param {string} prefix - Prefijo para filtrar archivos
 * @returns {Promise<Array>} - Lista de archivos
 */
const listFiles = async (prefix = '') => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Prefix: prefix
    };

    const result = await s3.listObjectsV2(params).promise();
    return result.Contents || [];
  } catch (error) {
    console.error('❌ Error listando archivos de S3:', error);
    throw error;
  }
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  getSignedUrl,
  listFiles
};
