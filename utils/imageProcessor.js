const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Redimensiona una imagen a 800px de ancho manteniendo la proporción
 * @param {string} inputPath - Ruta del archivo de entrada
 * @param {string} outputPath - Ruta del archivo de salida (opcional)
 * @param {number} maxWidth - Ancho máximo (por defecto 800)
 * @returns {Promise<Buffer>} - Buffer de la imagen redimensionada
 */
async function resizeImage(inputPath, outputPath = null, maxWidth = 800) {
  try {
    console.log(`🖼️ [IMAGE PROCESSOR] Redimensionando imagen: ${inputPath}`);
    console.log(`📏 [IMAGE PROCESSOR] Ancho máximo: ${maxWidth}px`);

    // Obtener metadatos de la imagen original
    const metadata = await sharp(inputPath).metadata();
    console.log(`📊 [IMAGE PROCESSOR] Imagen original: ${metadata.width}x${metadata.height}px`);

    // Verificar si la imagen ya es más pequeña que el ancho máximo
    if (metadata.width <= maxWidth) {
      console.log(`✅ [IMAGE PROCESSOR] Imagen ya es más pequeña que ${maxWidth}px, no necesita redimensionar`);
      return fs.readFileSync(inputPath);
    }

    // Calcular la nueva altura manteniendo la proporción
    const aspectRatio = metadata.width / metadata.height;
    const newHeight = Math.round(maxWidth / aspectRatio);
    
    console.log(`📐 [IMAGE PROCESSOR] Nueva dimensión: ${maxWidth}x${newHeight}px`);

    // Redimensionar la imagen
    const resizedBuffer = await sharp(inputPath)
      .resize(maxWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 }) // Comprimir con calidad 85%
      .toBuffer();

    console.log(`✅ [IMAGE PROCESSOR] Imagen redimensionada exitosamente`);
    console.log(`📦 [IMAGE PROCESSOR] Tamaño del buffer: ${(resizedBuffer.length / 1024).toFixed(2)}KB`);

    // Guardar en archivo si se especifica outputPath
    if (outputPath) {
      await fs.promises.writeFile(outputPath, resizedBuffer);
      console.log(`💾 [IMAGE PROCESSOR] Imagen guardada en: ${outputPath}`);
    }

    return resizedBuffer;
  } catch (error) {
    console.error(`❌ [IMAGE PROCESSOR] Error redimensionando imagen:`, error);
    throw error;
  }
}

/**
 * Redimensiona un buffer de imagen a 800px de ancho manteniendo la proporción
 * @param {Buffer} imageBuffer - Buffer de la imagen original
 * @param {number} maxWidth - Ancho máximo (por defecto 800)
 * @returns {Promise<Buffer>} - Buffer de la imagen redimensionada
 */
async function resizeImageBuffer(imageBuffer, maxWidth = 800) {
  try {
    console.log(`🖼️ [IMAGE PROCESSOR] Redimensionando buffer de imagen`);
    console.log(`📏 [IMAGE PROCESSOR] Ancho máximo: ${maxWidth}px`);

    // Obtener metadatos de la imagen original
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`📊 [IMAGE PROCESSOR] Imagen original: ${metadata.width}x${metadata.height}px`);

    // Verificar si la imagen ya es más pequeña que el ancho máximo
    if (metadata.width <= maxWidth) {
      console.log(`✅ [IMAGE PROCESSOR] Imagen ya es más pequeña que ${maxWidth}px, no necesita redimensionar`);
      return imageBuffer;
    }

    // Calcular la nueva altura manteniendo la proporción
    const aspectRatio = metadata.width / metadata.height;
    const newHeight = Math.round(maxWidth / aspectRatio);
    
    console.log(`📐 [IMAGE PROCESSOR] Nueva dimensión: ${maxWidth}x${newHeight}px`);

    // Redimensionar la imagen
    const resizedBuffer = await sharp(imageBuffer)
      .resize(maxWidth, newHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 85 }) // Comprimir con calidad 85%
      .toBuffer();

    console.log(`✅ [IMAGE PROCESSOR] Imagen redimensionada exitosamente`);
    console.log(`📦 [IMAGE PROCESSOR] Tamaño original: ${(imageBuffer.length / 1024).toFixed(2)}KB`);
    console.log(`📦 [IMAGE PROCESSOR] Tamaño redimensionado: ${(resizedBuffer.length / 1024).toFixed(2)}KB`);
    console.log(`📊 [IMAGE PROCESSOR] Reducción: ${((1 - resizedBuffer.length / imageBuffer.length) * 100).toFixed(1)}%`);

    return resizedBuffer;
  } catch (error) {
    console.error(`❌ [IMAGE PROCESSOR] Error redimensionando buffer:`, error);
    throw error;
  }
}

/**
 * Procesa una imagen desde un archivo temporal y la redimensiona
 * @param {string} tempFilePath - Ruta del archivo temporal
 * @param {number} maxWidth - Ancho máximo (por defecto 800)
 * @returns {Promise<Buffer>} - Buffer de la imagen procesada
 */
async function processImageFromFile(tempFilePath, maxWidth = 800) {
  try {
    console.log(`🖼️ [IMAGE PROCESSOR] Procesando imagen desde archivo: ${tempFilePath}`);
    
    // Verificar que el archivo existe
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`Archivo no encontrado: ${tempFilePath}`);
    }

    // Obtener estadísticas del archivo original
    const stats = fs.statSync(tempFilePath);
    console.log(`📦 [IMAGE PROCESSOR] Tamaño original: ${(stats.size / 1024).toFixed(2)}KB`);

    // Redimensionar la imagen
    const resizedBuffer = await resizeImageBuffer(fs.readFileSync(tempFilePath), maxWidth);

    // Eliminar archivo temporal
    try {
      fs.unlinkSync(tempFilePath);
      console.log(`🗑️ [IMAGE PROCESSOR] Archivo temporal eliminado: ${tempFilePath}`);
    } catch (deleteError) {
      console.warn(`⚠️ [IMAGE PROCESSOR] No se pudo eliminar archivo temporal: ${deleteError.message}`);
    }

    return resizedBuffer;
  } catch (error) {
    console.error(`❌ [IMAGE PROCESSOR] Error procesando imagen:`, error);
    throw error;
  }
}

module.exports = {
  resizeImage,
  resizeImageBuffer,
  processImageFromFile
};
