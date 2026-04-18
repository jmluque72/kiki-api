# Dockerfile simplificado para EasyVoley API con jsPDF
FROM node:18-alpine

# Build argument para el entorno (uat o prod)
ARG ENV=prod

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código de la aplicación (excluyendo .env local si existe)
COPY . .

# Copiar el archivo .env correspondiente al entorno
# Primero copiamos todos los .env.* disponibles, luego seleccionamos el correcto
RUN if [ -f ".env.${ENV}" ]; then \
      cp ".env.${ENV}" .env && \
      echo "✅ Archivo .env.${ENV} copiado como .env"; \
    else \
      echo "⚠️  Advertencia: No se encontró .env.${ENV}"; \
      echo "⚠️  El contenedor usará variables de entorno del sistema o valores por defecto"; \
    fi

# Configurar variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Cambiar permisos del directorio
RUN chown -R nodejs:nodejs /app
USER nodejs

# Exponer puerto
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["node", "simple-server.js"] 
