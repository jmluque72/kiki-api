const express = require('express');

const router = express.Router();

/**
 * Informes de error/crash desde la app móvil (sin autenticación obligatoria).
 * El cuerpo puede incluir stack largo; se limita el tamaño en el servidor principal.
 */
router.post('/client-crashes', (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const entry = {
      ...payload,
      receivedAt: new Date().toISOString(),
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    console.error('📱 [CLIENT CRASH REPORT]', JSON.stringify(entry, null, 2));

    return res.status(201).json({
      success: true,
      message: 'Informe recibido',
      id: String(Date.now()),
    });
  } catch (err) {
    console.error('❌ [CLIENT CRASH REPORT] Error guardando informe:', err);
    return res.status(500).json({
      success: false,
      message: 'No se pudo registrar el informe',
    });
  }
});

module.exports = router;
