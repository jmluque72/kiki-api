#!/bin/bash

# Script para ejecutar tests del API
# Uso: ./run-tests.sh [opciones]

set -e

echo "🧪 Ejecutando tests del API..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar ayuda
show_help() {
    echo "Uso: ./run-tests.sh [opciones]"
    echo ""
    echo "Opciones:"
    echo "  -h, --help          Mostrar esta ayuda"
    echo "  -w, --watch         Ejecutar tests en modo watch"
    echo "  -c, --coverage      Ejecutar tests con coverage"
    echo "  -u, --update        Actualizar snapshots"
    echo "  -v, --verbose       Modo verbose"
    echo "  --ci                Modo CI (sin watch, con coverage)"
    echo ""
    echo "Ejemplos:"
    echo "  ./run-tests.sh                    # Ejecutar todos los tests"
    echo "  ./run-tests.sh --watch            # Modo watch"
    echo "  ./run-tests.sh --coverage         # Con coverage"
    echo "  ./run-tests.sh --ci               # Modo CI"
}

# Variables por defecto
WATCH=false
COVERAGE=false
UPDATE=false
VERBOSE=false
CI=false

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -w|--watch)
            WATCH=true
            shift
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -u|--update)
            UPDATE=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --ci)
            CI=true
            shift
            ;;
        *)
            echo -e "${RED}❌ Opción desconocida: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: No se encontró package.json. Ejecuta este script desde el directorio del API.${NC}"
    exit 1
fi

# Verificar que las dependencias estén instaladas
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependencias...${NC}"
    npm install
fi

# Configurar variables de entorno para testing
export NODE_ENV=test
export MONGODB_URI=${MONGODB_URI:-"mongodb://localhost:27017/kiki-test"}
export JWT_SECRET=${JWT_SECRET:-"test-jwt-secret"}
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-"test-access-key"}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-"test-secret-key"}
export AWS_REGION=${AWS_REGION:-"us-east-1"}
export S3_BUCKET=${S3_BUCKET:-"test-bucket"}

echo -e "${BLUE}🔧 Configuración:${NC}"
echo "  NODE_ENV: $NODE_ENV"
echo "  MONGODB_URI: $MONGODB_URI"
echo "  Watch: $WATCH"
echo "  Coverage: $COVERAGE"
echo "  CI: $CI"
echo ""

# Construir comando de Jest
JEST_CMD="npx jest"

if [ "$CI" = true ]; then
    JEST_CMD="$JEST_CMD --ci --coverage --watchAll=false"
elif [ "$WATCH" = true ]; then
    JEST_CMD="$JEST_CMD --watch"
elif [ "$COVERAGE" = true ]; then
    JEST_CMD="$JEST_CMD --coverage"
fi

if [ "$UPDATE" = true ]; then
    JEST_CMD="$JEST_CMD --updateSnapshot"
fi

if [ "$VERBOSE" = true ]; then
    JEST_CMD="$JEST_CMD --verbose"
fi

# Ejecutar tests
echo -e "${BLUE}🚀 Ejecutando: $JEST_CMD${NC}"
echo ""

if eval $JEST_CMD; then
    echo ""
    echo -e "${GREEN}✅ Tests completados exitosamente!${NC}"
    
    if [ "$COVERAGE" = true ] || [ "$CI" = true ]; then
        echo -e "${BLUE}📊 Reporte de coverage generado en: ./coverage/index.html${NC}"
    fi
    
    exit 0
else
    echo ""
    echo -e "${RED}❌ Tests fallaron!${NC}"
    exit 1
fi
