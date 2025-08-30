FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Instalar Express 4.x para evitar problemas de compatibilidad
RUN npm install express@4.18.2

# Copiar todo el código fuente
COPY . .

# Exponer puertos
EXPOSE 3000 3001 3002

# Comando para iniciar el servidor unificado
CMD ["node", "--no-deprecation", "simple-server.js"] 