#!/bin/bash

# Script para buildear y desplegar la API en PRODUCCIÓN (ECS)
# Uso: ./run-prod.sh

ENV=prod

# Validar que existe el archivo .env correspondiente
if [ ! -f ".env.${ENV}" ]; then
  echo "❌ Error: No se encontró el archivo .env.${ENV}"
  echo "Por favor, crea el archivo .env.${ENV} con las variables de entorno para producción"
  exit 1
fi

echo "🚀 Building para PRODUCCIÓN (ECS)"

# Build con el build arg del entorno
docker build --platform linux/amd64 --build-arg ENV=${ENV} -t kikiapi .

# Tag con el entorno
docker tag kikiapi:latest 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:prod
docker tag kikiapi:latest 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:latest

# Login a ECR
echo "🔐 Login a ECR..."
aws ecr get-login-password --region us-east-1 --profile mio | docker login --username AWS --password-stdin 638579994720.dkr.ecr.us-east-1.amazonaws.com

# Push ambas tags
echo "📤 Subiendo imagen a ECR..."
docker push 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:prod
docker push 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:latest

# Actualizar el servicio ECS
echo "🔄 Actualizando servicio ECS..."
aws ecs update-service --cluster kiki --service kiki-api --force-new-deployment --profile mio

echo "✅ Build y despliegue a PRODUCCIÓN completado"
