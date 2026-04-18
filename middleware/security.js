const mongoose = require('mongoose');

/**
 * Middleware para validar ObjectIds en parámetros de ruta
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: `Parámetro ${paramName} es requerido`
      });
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `ID inválido: ${id}`
      });
    }
    
    next();
  };
};

/**
 * Sanitiza un objeto para prevenir NoSQL Injection
 * Elimina operadores MongoDB peligrosos como $ne, $gt, $regex, etc.
 */
const sanitizeQuery = (query) => {
  if (!query || typeof query !== 'object') {
    return query;
  }
  
  const sanitized = {};
  const dangerousOperators = ['$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$regex', '$where', '$expr'];
  
  for (const [key, value] of Object.entries(query)) {
    // Si la clave es un operador peligroso, ignorarlo
    if (dangerousOperators.includes(key)) {
      continue;
    }
    
    // Si el valor es un objeto, sanitizarlo recursivamente
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
      const sanitizedValue = sanitizeQuery(value);
      // Solo agregar si no está vacío y no contiene operadores peligrosos
      if (Object.keys(sanitizedValue).length > 0 && !Object.keys(sanitizedValue).some(k => dangerousOperators.includes(k))) {
        sanitized[key] = sanitizedValue;
      }
    } else if (Array.isArray(value)) {
      // Sanitizar arrays
      sanitized[key] = value.map(item => 
        (item && typeof item === 'object' && !(item instanceof Date) && !(item instanceof mongoose.Types.ObjectId))
          ? sanitizeQuery(item)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

/**
 * Middleware para sanitizar req.query y req.body
 */
const sanitizeInputs = (req, res, next) => {
  if (req.query) {
    req.query = sanitizeQuery(req.query);
  }
  
  if (req.body) {
    req.body = sanitizeQuery(req.body);
  }
  
  next();
};

/**
 * Valida que un ObjectId sea válido antes de usarlo en queries
 */
const validateAndSanitizeObjectId = (id) => {
  if (!id) {
    return null;
  }
  
  if (typeof id === 'string') {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return new mongoose.Types.ObjectId(id);
  }
  
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  
  return null;
};

module.exports = {
  validateObjectId,
  sanitizeQuery,
  sanitizeInputs,
  validateAndSanitizeObjectId
};

