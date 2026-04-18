#!/bin/bash

# Script para empaquetar y desplegar la API para UAT (EC2/Apache)
# Uso: ./run-uat.sh [--export] [--deploy]
#
# Opciones:
#   --export              Crea un tar.gz del proyecto
#   --deploy              Despliega automáticamente a EC2 (usa valores configurados abajo)

# =============================================================================
# CONFIGURACIÓN - Edita estos valores según tu entorno UAT
# =============================================================================

# Archivo de clave SSH (PEM)
SSH_KEY="/Users/manuelluque/proyects/takeabed/jmluque72_roller.pem"

# Host/IP del servidor EC2
DEPLOY_HOST="54.226.25.80"

# Usuario SSH para conectarse al servidor
SSH_USER="ubuntu"

# Ruta remota en el servidor donde se desplegará la aplicación
REMOTE_PATH="${REMOTE_PATH:-/tmp/kiki-api}"

# Entorno
ENV=uat

# =============================================================================
# FIN DE CONFIGURACIÓN
# =============================================================================

# Validar que existe el archivo .env correspondiente
if [ ! -f ".env.${ENV}" ]; then
  echo "❌ Error: No se encontró el archivo .env.${ENV}"
  echo "Por favor, crea el archivo .env.${ENV} con las variables de entorno para UAT"
  exit 1
fi

# Procesar argumentos
EXPORT=false
DO_DEPLOY=false

# Expandir ruta de SSH_KEY
SSH_KEY_EXPANDED="${SSH_KEY/#\~/$HOME}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --export)
      EXPORT=true
      shift
      ;;
    --deploy)
      DO_DEPLOY=true
      shift
      ;;
    --host)
      if [ -z "$2" ]; then
        echo "❌ Error: --host requiere un host"
        exit 1
      fi
      DEPLOY_HOST="$2"
      shift 2
      ;;
    --remote-path)
      if [ -z "$2" ]; then
        echo "❌ Error: --remote-path requiere una ruta"
        exit 1
      fi
      REMOTE_PATH="$2"
      shift 2
      ;;
    --ssh-user)
      if [ -z "$2" ]; then
        echo "❌ Error: --ssh-user requiere un usuario"
        exit 1
      fi
      SSH_USER="$2"
      shift 2
      ;;
    --ssh-key)
      if [ -z "$2" ]; then
        echo "❌ Error: --ssh-key requiere una ruta"
        exit 1
      fi
      SSH_KEY="$2"
      SSH_KEY_EXPANDED="${SSH_KEY/#\~/$HOME}"
      shift 2
      ;;
    *)
      echo "❌ Opción desconocida: $1"
      echo "Uso: ./run-uat.sh [--export] [--deploy] [--host HOST] [--remote-path PATH] [--ssh-user USER] [--ssh-key KEY]"
      exit 1
      ;;
  esac
done

echo "📦 Preparando proyecto para UAT..."

# Crear directorio temporal para el empaquetado
TEMP_DIR=$(mktemp -d)
TEMP_API_DIR="${TEMP_DIR}/api"

# Crear directorio temporal
mkdir -p "${TEMP_API_DIR}"

# Copiar archivos usando find y cp (compatible con macOS y Linux)
echo "📋 Copiando archivos..."
find . -type f \
  ! -path './node_modules/*' \
  ! -path './.git/*' \
  ! -path './logs/*' \
  ! -path './coverage/*' \
  ! -path './.nyc_output/*' \
  ! -path './uploads/*' \
  ! -path './test/*' \
  ! -path './tests/*' \
  ! -name '*.log' \
  ! -name '*.pid' \
  ! -name '*.seed' \
  ! -name '*.pid.lock' \
  ! -name '.DS_Store' \
  ! -name 'Thumbs.db' \
  ! -name '*.tgz' \
  ! -name 'Dockerfile' \
  ! -name 'run-prod.sh' \
  ! -name 'run-uat.sh' \
  ! -name '.env' \
  ! -name '.env.local' \
  ! -name '.env.*.local' \
  ! -name '.gitignore' \
  | while read file; do
      # Crear directorio de destino si no existe
      dir=$(dirname "${TEMP_API_DIR}/${file#./}")
      mkdir -p "$dir"
      # Copiar archivo
      cp "$file" "${TEMP_API_DIR}/${file#./}"
    done

# Copiar el .env.uat como .env
cp ".env.${ENV}" "${TEMP_API_DIR}/.env"

echo "✅ Archivos copiados"

# Crear el tar.gz
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
EXPORT_FILE="kikiapi-uat-${TIMESTAMP}.tar.gz"
CURRENT_DIR=$(pwd)
EXPORT_FILE_FULL="${CURRENT_DIR}/${EXPORT_FILE}"

echo "📦 Creando archivo comprimido..."
cd "${TEMP_DIR}"
tar -czf "${EXPORT_FILE_FULL}" api/
cd "${CURRENT_DIR}"

# Limpiar directorio temporal
rm -rf "${TEMP_DIR}"

echo "✅ Archivo creado: ${EXPORT_FILE_FULL}"

# Mostrar instrucciones si se exporta o si no hay deploy automático
if [ "$EXPORT" = true ] || [ "$DO_DEPLOY" = false ]; then
  echo ""
  echo "📋 Para desplegar en EC2:"
  echo ""
  echo "   Opción 1: Despliegue automático (recomendado)"
  echo "   ./run-uat.sh --deploy"
  echo "   (El script se conectará por SSH y ejecutará todos los pasos automáticamente)"
  echo ""
  echo "   Opción 2: Despliegue manual"
  echo "   1. Sube el archivo ${EXPORT_FILE} a tu servidor EC2"
  echo "   2. En EC2, ejecuta los siguientes comandos:"
  echo ""
  echo "      # Detener el proceso actual"
  echo "      pm2 stop kiki-api || pkill -f 'node.*simple-server.js' || true"
  echo ""
  echo "      # Crear directorio si no existe"
  echo "      sudo mkdir -p ${REMOTE_PATH}"
  echo "      sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH}"
  echo ""
  echo "      # Extraer el archivo"
  echo "      cd ${REMOTE_PATH}"
  echo "      tar -xzf /path/to/${EXPORT_FILE}"
  echo ""
  echo "      # Instalar dependencias"
  echo "      cd ${REMOTE_PATH}/api"
  echo "      npm ci --only=production"
  echo ""
  echo "      # Iniciar el proceso"
  echo "      pm2 start simple-server.js --name kiki-api || node simple-server.js &"
  echo ""
  echo "   3. Configura Apache como proxy reverso al puerto 3000"
  echo ""
  echo "   💡 Nota: Configura SSH_KEY, DEPLOY_HOST, SSH_USER y REMOTE_PATH"
  echo "      en la sección de CONFIGURACIÓN al inicio del script."
fi

# Desplegar directamente si se solicita
if [ "$DO_DEPLOY" = true ]; then
  echo ""
  echo "🚀 Desplegando a EC2: ${DEPLOY_HOST}"
  echo "   Usuario: ${SSH_USER}"
  echo "   Ruta remota: ${REMOTE_PATH}"
  echo "   Clave SSH: ${SSH_KEY}"
  
  # Verificar que existe la clave SSH
  if [ ! -f "$SSH_KEY_EXPANDED" ]; then
    echo "❌ Error: No se encontró clave SSH en $SSH_KEY_EXPANDED"
    echo "   Por favor, configura SSH_KEY en la sección de CONFIGURACIÓN del script"
    exit 1
  fi
  
  # Verificar y corregir permisos del archivo PEM
  echo "🔐 Verificando permisos del archivo PEM..."
  CURRENT_PERMS=$(stat -f "%OLp" "$SSH_KEY_EXPANDED" 2>/dev/null || stat -c "%a" "$SSH_KEY_EXPANDED" 2>/dev/null || echo "unknown")
  
  if [ "$CURRENT_PERMS" != "600" ] && [ "$CURRENT_PERMS" != "400" ]; then
    echo "⚠️  Permisos actuales: $CURRENT_PERMS (requerido: 600 o 400)"
    echo "🔧 Corrigiendo permisos del archivo PEM..."
    chmod 600 "$SSH_KEY_EXPANDED"
    if [ $? -eq 0 ]; then
      echo "✅ Permisos corregidos a 600"
    else
      echo "❌ Error: No se pudieron corregir los permisos del archivo PEM"
      echo "   Por favor, ejecuta manualmente: chmod 600 $SSH_KEY_EXPANDED"
      exit 1
    fi
  else
    echo "✅ Permisos correctos: $CURRENT_PERMS"
  fi
  
  # Verificar que el host está configurado
  if [ -z "$DEPLOY_HOST" ] || [ "$DEPLOY_HOST" = "ec2-xxx-xxx-xxx-xxx.compute-1.amazonaws.com" ]; then
    echo "❌ Error: DEPLOY_HOST no está configurado correctamente"
    echo "   Por favor, edita el script y configura DEPLOY_HOST con la IP o hostname de tu servidor EC2"
    exit 1
  fi
  
  # Transferir a EC2 usando SCP (más confiable para archivos individuales)
  echo "📤 Transfiriendo a EC2 vía SCP..."
  
  # Usar ruta absoluta del archivo
  EXPORT_FILE_FULL="${CURRENT_DIR}/${EXPORT_FILE}"
  
  if [ ! -f "$EXPORT_FILE_FULL" ]; then
    echo "❌ Error: No se encontró el archivo ${EXPORT_FILE_FULL}"
    exit 1
  fi
  
  echo "   Archivo: ${EXPORT_FILE_FULL}"
  echo "   Tamaño: $(du -h "${EXPORT_FILE_FULL}" | cut -f1)"
  
  # Usar SCP con opciones para evitar problemas con host key verification
  scp -i "$SSH_KEY_EXPANDED" \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      "${EXPORT_FILE_FULL}" \
      "${SSH_USER}@${DEPLOY_HOST}:/tmp/${EXPORT_FILE}"
  
  SCP_EXIT_CODE=$?
  
  if [ $SCP_EXIT_CODE -ne 0 ]; then
    echo "❌ Error al transferir archivo vía SCP (código: $SCP_EXIT_CODE)"
    exit 1
  fi
  
  echo "✅ Archivo transferido correctamente"
  
  # Desplegar en EC2
  echo "🔄 Desplegando en EC2..."
  ssh -i "$SSH_KEY_EXPANDED" \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      "${SSH_USER}@${DEPLOY_HOST}" << EOF
    set -e
    
    echo "🛑 Deteniendo proceso actual..."
    pm2 stop kiki-api 2>/dev/null || pkill -f 'node.*simple-server.js' 2>/dev/null || echo "No hay proceso corriendo"
    
    echo "📁 Preparando directorio..."
    sudo mkdir -p ${REMOTE_PATH}
    sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH} || true
    
    # Backup del directorio actual si existe
    if [ -d "${REMOTE_PATH}/api" ]; then
      echo "💾 Creando backup..."
      BACKUP_DIR="${REMOTE_PATH}/backup-\$(date +%Y%m%d-%H%M%S)"
      mv "${REMOTE_PATH}/api" "\${BACKUP_DIR}" || true
    fi
    
    echo "📦 Extrayendo archivo..."
    cd ${REMOTE_PATH}
    tar -xzf /tmp/${EXPORT_FILE}
    
    echo "📥 Instalando dependencias..."
    cd ${REMOTE_PATH}/api
    npm ci --only=production
    
    echo "🚀 Iniciando aplicación..."
    # Intentar con PM2, si no está disponible usar node directamente
    if command -v pm2 &> /dev/null; then
      pm2 start simple-server.js --name kiki-api --update-env
      pm2 save || true
      echo "✅ Aplicación iniciada con PM2"
    else
      nohup node simple-server.js > server.log 2>&1 &
      echo "✅ Aplicación iniciada con node (PID: \$!)"
    fi
    
    # Limpiar archivo temporal
    rm /tmp/${EXPORT_FILE}
    
    echo "✅ Despliegue completado en ${REMOTE_PATH}/api"
    echo "📋 Verifica que Apache esté configurado como proxy reverso al puerto 3000"
EOF
  
  echo "✅ Despliegue completado"
fi

