const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Crear directorio si no existe
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

// Validar formato de base64
const validateBase64Image = (base64String) => {
  // Verificar que sea un base64 válido de imagen
  const base64Regex = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/;
  return base64Regex.test(base64String);
};

// Extraer información del base64
const parseBase64Image = (base64String) => {
  const matches = base64String.match(/^data:image\/([a-zA-Z]*);base64,(.*)$/);
  
  if (!matches || matches.length !== 3) {
    throw new Error('Formato de base64 inválido');
  }

  return {
    extension: matches[1] === 'jpeg' ? 'jpg' : matches[1],
    data: matches[2],
    mimeType: `image/${matches[1]}`
  };
};

// Generar nombre único para el archivo
const generateUniqueFileName = (extension) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `logo_${timestamp}_${randomString}.${extension}`;
};

// Guardar imagen desde base64
const saveBase64Image = async (base64String, subFolder = 'logos') => {
  try {
    // Validar formato
    if (!validateBase64Image(base64String)) {
      throw new Error('El formato de imagen no es válido. Formatos soportados: jpeg, jpg, png, gif, webp');
    }

    // Parsear base64
    const { extension, data, mimeType } = parseBase64Image(base64String);

    // Crear directorio de destino
    const uploadsDir = path.join(process.cwd(), 'uploads', subFolder);
    await ensureDirectoryExists(uploadsDir);

    // Generar nombre único
    const fileName = generateUniqueFileName(extension);
    const filePath = path.join(uploadsDir, fileName);

    // Convertir base64 a buffer y guardar
    const buffer = Buffer.from(data, 'base64');
    
    // Validar tamaño (máximo 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (buffer.length > maxSize) {
      throw new Error('La imagen es demasiado grande. Tamaño máximo: 5MB');
    }

    await fs.writeFile(filePath, buffer);

    // Retornar información del archivo
    return {
      fileName,
      filePath,
      relativePath: `/uploads/${subFolder}/${fileName}`,
      url: `/api/files/${subFolder}/${fileName}`,
      size: buffer.length,
      mimeType,
      extension
    };

  } catch (error) {
    console.error('Error guardando imagen base64:', error);
    throw error;
  }
};

// Eliminar archivo
const deleteFile = async (filePath) => {
  try {
    const fullPath = path.join(process.cwd(), filePath.replace('/api/files/', 'uploads/'));
    await fs.unlink(fullPath);
    return true;
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    return false;
  }
};

// Verificar si el archivo existe
const fileExists = async (filePath) => {
  try {
    const fullPath = path.join(process.cwd(), filePath.replace('/api/files/', 'uploads/'));
    await fs.access(fullPath);
    return true;
  } catch (error) {
    return false;
  }
};

// Obtener información del archivo
const getFileInfo = async (filePath) => {
  try {
    const fullPath = path.join(process.cwd(), filePath.replace('/api/files/', 'uploads/'));
    const stats = await fs.stat(fullPath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      exists: true
    };
  } catch (error) {
    return { exists: false };
  }
};

module.exports = {
  saveBase64Image,
  deleteFile,
  fileExists,
  getFileInfo,
  validateBase64Image,
  ensureDirectoryExists
}; 