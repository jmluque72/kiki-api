const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3, multerS3Config } = require('../config/s3.config');
const { v4: uuidv4 } = require('uuid');

// Configurar multer para S3
const upload = multer({
  storage: multerS3(multerS3Config),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Verificar tipo de archivo
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Función para subir imagen y retornar la URL
const uploadImage = async (file) => {
  try {
    const fileExtension = file.mimetype.split('/')[1];
    const fileName = `${uuidv4()}.${fileExtension}`;
    const key = `uploads/${fileName}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    };

    const result = await s3.upload(params).promise();
    
    return {
      success: true,
      imageId: fileName,
      imageKey: key,
      imageUrl: result.Location,
      message: 'Imagen subida exitosamente'
    };
  } catch (error) {
    console.error('Error al subir imagen a S3:', error);
    return {
      success: false,
      error: error.message,
      message: 'Error al subir la imagen'
    };
  }
};

// Función para eliminar imagen de S3
const deleteImage = async (imageKey) => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: imageKey
    };

    await s3.deleteObject(params).promise();
    
    return {
      success: true,
      message: 'Imagen eliminada exitosamente'
    };
  } catch (error) {
    console.error('Error al eliminar imagen de S3:', error);
    return {
      success: false,
      error: error.message,
      message: 'Error al eliminar la imagen'
    };
  }
};

// Función para obtener URL de imagen
const getImageUrl = (imageKey) => {
  if (!imageKey) return null;
  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${imageKey}`;
};

module.exports = {
  upload,
  uploadImage,
  deleteImage,
  getImageUrl
};
