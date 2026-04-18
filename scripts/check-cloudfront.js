require('dotenv').config();
const { CloudFrontClient, ListDistributionsCommand, GetDistributionCommand } = require('@aws-sdk/client-cloudfront');

// Configuración de AWS
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// Cliente CloudFront
const cloudfrontClient = new CloudFrontClient(awsConfig);

console.log('🔍 Verificando CloudFront para rate limiting...\n');
console.log('📋 Configuración AWS:');
console.log(`   - Región: ${awsConfig.region}`);
console.log(`   - Access Key ID: ${awsConfig.credentials.accessKeyId ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`   - Secret Access Key: ${awsConfig.credentials.secretAccessKey ? '✅ Configurado' : '❌ No configurado'}\n`);

if (!awsConfig.credentials.accessKeyId || !awsConfig.credentials.secretAccessKey) {
  console.error('❌ Error: AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY deben estar configurados en .env');
  process.exit(1);
}

async function checkCloudFront() {
  try {
    console.log('🔍 [CloudFront] Verificando distribuciones...\n');
    
    const listDistributionsCommand = new ListDistributionsCommand({});
    const distributionsResponse = await cloudfrontClient.send(listDistributionsCommand);
    
    if (!distributionsResponse.DistributionList || !distributionsResponse.DistributionList.Items || distributionsResponse.DistributionList.Items.length === 0) {
      console.log('⚠️  No se encontraron distribuciones de CloudFront\n');
      return;
    }
    
    console.log(`📊 Se encontraron ${distributionsResponse.DistributionList.Items.length} distribución(es) de CloudFront:\n`);
    
    for (const distributionSummary of distributionsResponse.DistributionList.Items) {
      console.log(`🔹 Distribución: ${distributionSummary.Id}`);
      console.log(`   - Domain Name: ${distributionSummary.DomainName}`);
      console.log(`   - Estado: ${distributionSummary.Status}`);
      console.log(`   - Enabled: ${distributionSummary.Enabled ? 'Sí' : 'No'}`);
      console.log(`   - Price Class: ${distributionSummary.PriceClass || 'N/A'}`);
      
      // Obtener detalles completos
      try {
        const getDistributionCommand = new GetDistributionCommand({
          Id: distributionSummary.Id
        });
        const distributionResponse = await cloudfrontClient.send(getDistributionCommand);
        
        const distribution = distributionResponse.Distribution;
        if (distribution) {
          console.log(`   - ARN: ${distribution.ARN}`);
          console.log(`   - Origins: ${distribution.DistributionConfig.Origins?.Items?.length || 0}`);
          
          // Verificar origins (podrían apuntar al ALB)
          if (distribution.DistributionConfig.Origins?.Items) {
            console.log(`\n   📍 Origins:`);
            distribution.DistributionConfig.Origins.Items.forEach((origin, idx) => {
              console.log(`      ${idx + 1}. ${origin.Id}`);
              console.log(`         Domain: ${origin.DomainName}`);
              console.log(`         Path: ${origin.OriginPath || '/'}`);
              if (origin.CustomOriginConfig) {
                console.log(`         Tipo: Custom Origin`);
                console.log(`         Protocol: ${origin.CustomOriginConfig.OriginProtocolPolicy || 'N/A'}`);
              }
              if (origin.S3OriginConfig) {
                console.log(`         Tipo: S3 Origin`);
              }
            });
          }
          
          // Verificar si hay rate limiting en las configuraciones
          if (distribution.DistributionConfig.DefaultCacheBehavior) {
            const cacheBehavior = distribution.DistributionConfig.DefaultCacheBehavior;
            console.log(`\n   ⚙️  Default Cache Behavior:`);
            console.log(`      - Viewer Protocol Policy: ${cacheBehavior.ViewerProtocolPolicy || 'N/A'}`);
            console.log(`      - Allowed Methods: ${cacheBehavior.AllowedMethods?.Items?.join(', ') || 'N/A'}`);
            console.log(`      - Cached Methods: ${cacheBehavior.AllowedMethods?.CachedMethods?.Items?.join(', ') || 'N/A'}`);
            
            // Verificar si hay restricciones de rate limiting
            if (cacheBehavior.TrustedSigners?.Enabled) {
              console.log(`      - Trusted Signers: Habilitado`);
            }
            if (cacheBehavior.TrustedKeyGroups?.Enabled) {
              console.log(`      - Trusted Key Groups: Habilitado`);
            }
          }
          
          // Verificar Custom Error Responses (podrían retornar 429)
          if (distribution.DistributionConfig.CustomErrorResponses?.Items) {
            const error429 = distribution.DistributionConfig.CustomErrorResponses.Items.find(
              err => err.ErrorCode === 429 || err.ErrorCachingMinTTL
            );
            if (error429) {
              console.log(`\n   ⚠️  Custom Error Response para 429:`);
              console.log(`      - Error Code: ${error429.ErrorCode}`);
              console.log(`      - Response Code: ${error429.ResponseCode || 'N/A'}`);
              console.log(`      - Error Caching Min TTL: ${error429.ErrorCachingMinTTL || 'N/A'}`);
            }
          }
        }
      } catch (getError) {
        console.log(`   ⚠️  Error obteniendo detalles: ${getError.message}`);
      }
      
      console.log('\n');
    }
  } catch (error) {
    if (error.name === 'AccessDeniedException') {
      console.log('⚠️  No tienes permisos para acceder a CloudFront');
      console.log('💡 Verifica los permisos IAM: cloudfront:ListDistributions, cloudfront:GetDistribution\n');
    } else {
      console.error('❌ Error verificando CloudFront:', error.message);
    }
  }
}

async function main() {
  try {
    await checkCloudFront();
    
    console.log('✅ Verificación completada\n');
    console.log('📝 Notas importantes:');
    console.log('   - CloudFront no tiene rate limiting nativo');
    console.log('   - Si CloudFront está delante del ALB, verifica:');
    console.log('     * Custom Error Responses');
    console.log('     * Lambda@Edge functions (si están configuradas)');
    console.log('     * WAF asociado a CloudFront (scope CLOUDFRONT)\n');
  } catch (error) {
    console.error('❌ Error general:', error);
    process.exit(1);
  }
}

main();

