const express = require('express');
const path = require('path');
const fs = require('fs').promises;

// Middleware para servir archivos estáticos
const createFileServer = () => {
  const router = express.Router();

  // Servir archivos desde /api/files/*
  router.get('/:folder/:filename', async (req, res) => {
    try {
      const { folder, filename } = req.params;
      
      // Validar folder permitido
      const allowedFolders = ['logos', 'avatars', 'documents'];
      if (!allowedFolders.includes(folder)) {
        return res.status(404).json({
          success: false,
          message: 'Carpeta no encontrada'
        });
      }

      // Construir path del archivo
      const filePath = path.join(process.cwd(), 'uploads', folder, filename);
      
      // Verificar si el archivo existe
      try {
        await fs.access(filePath);
      } catch (error) {
        return res.status(404).json({
          success: false,
          message: 'Archivo no encontrado'
        });
      }

      // Obtener información del archivo
      const stats = await fs.stat(filePath);
      const ext = path.extname(filename).toLowerCase();
      
      // Definir content-type basado en extensión
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';

      // Configurar headers
      res.set({
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'public, max-age=31536000', // Cache por 1 año
        'ETag': `"${stats.mtime.getTime()}-${stats.size}"`,
        'Last-Modified': stats.mtime.toUTCString()
      });

      // Verificar cache del cliente
      const clientETag = req.headers['if-none-match'];
      const serverETag = `"${stats.mtime.getTime()}-${stats.size}"`;
      
      if (clientETag === serverETag) {
        return res.status(304).end();
      }

      // Enviar archivo
      res.sendFile(filePath);

    } catch (error) {
      console.error('Error sirviendo archivo:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  });

  return router;
};

module.exports = { createFileServer }; 