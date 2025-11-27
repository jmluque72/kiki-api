require('dotenv').config();
// Importar usando require directo
const wafv2Module = require('@aws-sdk/client-wafv2');

// En AWS SDK v3, el cliente está en __Client
const WAFv2Client = wafv2Module.__Client;
if (!WAFv2Client) {
  console.error('❌ No se pudo encontrar __Client en el módulo');
  process.exit(1);
}

const { ListWebACLsCommand, GetWebACLCommand, ListResourcesForWebACLCommand } = wafv2Module;

// Configuración de AWS
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// Cliente AWS WAF
const wafClient = new WAFv2Client(awsConfig);

console.log('🔍 Verificando AWS WAF para rate limiting...\n');
console.log('📋 Configuración AWS:');
console.log(`   - Región: ${awsConfig.region}`);
console.log(`   - Access Key ID: ${awsConfig.credentials.accessKeyId ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`   - Secret Access Key: ${awsConfig.credentials.secretAccessKey ? '✅ Configurado' : '❌ No configurado'}\n`);

if (!awsConfig.credentials.accessKeyId || !awsConfig.credentials.secretAccessKey) {
  console.error('❌ Error: AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY deben estar configurados en .env');
  process.exit(1);
}

async function checkWAFRateLimiting() {
  console.log('🔍 [WAF] Verificando Web ACLs...\n');
  
  // WAF puede estar en scope REGIONAL (para ALB) o CLOUDFRONT
  const scopes = ['REGIONAL', 'CLOUDFRONT'];
  
  for (const scope of scopes) {
    try {
      console.log(`📊 Verificando WAF en scope: ${scope}\n`);
      
      const listWebACLsCommand = new ListWebACLsCommand({
        Scope: scope
      });
      const webACLsResponse = await wafClient.send(listWebACLsCommand);
      
      if (!webACLsResponse.WebACLs || webACLsResponse.WebACLs.length === 0) {
        console.log(`   ⚠️  No se encontraron Web ACLs en scope ${scope}\n`);
        continue;
      }
      
      console.log(`   📊 Se encontraron ${webACLsResponse.WebACLs.length} Web ACL(s) en scope ${scope}:\n`);
      
      for (const webACLSummary of webACLsResponse.WebACLs) {
        console.log(`   🔹 Web ACL: ${webACLSummary.Name}`);
        console.log(`      - ID: ${webACLSummary.Id}`);
        console.log(`      - ARN: ${webACLSummary.ARN}`);
        console.log(`      - Descripción: ${webACLSummary.Description || 'Sin descripción'}`);
        
        // Obtener detalles completos del Web ACL
        try {
          const getWebACLCommand = new GetWebACLCommand({
            Scope: scope,
            Id: webACLSummary.Id,
            Name: webACLSummary.Name
          });
          const webACLResponse = await wafClient.send(getWebACLCommand);
          
          const webACL = webACLResponse.WebACL;
          if (webACL) {
            console.log(`      - Capacidad: ${webACL.Capacity || 'N/A'}`);
            console.log(`      - Reglas: ${webACL.Rules?.length || 0}`);
            
            // Verificar reglas de rate limiting
            if (webACL.Rules && webACL.Rules.length > 0) {
              console.log(`\n      📜 Reglas (${webACL.Rules.length}):`);
              
              for (const rule of webACL.Rules) {
                console.log(`         - Regla: ${rule.Name}`);
                console.log(`           Prioridad: ${rule.Priority}`);
                console.log(`           Acción: ${rule.Action?.Allow ? 'Allow' : rule.Action?.Block ? 'Block' : rule.Action?.Count ? 'Count' : 'N/A'}`);
                
                // Verificar si es una regla de rate limiting
                if (rule.Statement) {
                  // Rate-based rules tienen RateBasedStatement
                  if (rule.Statement.RateBasedStatement) {
                    console.log(`           ⚠️  ⚠️  ⚠️  RATE LIMITING DETECTADO ⚠️  ⚠️  ⚠️`);
                    console.log(`              - Tipo: Rate-based rule`);
                    console.log(`              - Límite: ${rule.Statement.RateBasedStatement.Limit || 'N/A'}`);
                    console.log(`              - Agregación: ${rule.Statement.RateBasedStatement.AggregateKeyType || 'N/A'}`);
                    console.log(`              - Acción cuando se excede: ${rule.Action?.Block ? 'BLOCK' : rule.Action?.Count ? 'COUNT' : 'ALLOW'}`);
                    
                    if (rule.Statement.RateBasedStatement.ScopeDownStatement) {
                      console.log(`              - Scope Down: ${JSON.stringify(rule.Statement.RateBasedStatement.ScopeDownStatement, null, 2)}`);
                    }
                  }
                  
                  // Verificar ManagedRuleGroupStatement (puede incluir rate limiting)
                  if (rule.Statement.ManagedRuleGroupStatement) {
                    const managedRule = rule.Statement.ManagedRuleGroupStatement;
                    console.log(`           - Managed Rule Group: ${managedRule.VendorName}/${managedRule.Name}`);
                    if (managedRule.ExcludedRules && managedRule.ExcludedRules.length > 0) {
                      console.log(`             Reglas excluidas: ${managedRule.ExcludedRules.map(r => r.Name).join(', ')}`);
                    }
                  }
                  
                  // Verificar RuleGroupReferenceStatement
                  if (rule.Statement.RuleGroupReferenceStatement) {
                    console.log(`           - Rule Group Reference: ${rule.Statement.RuleGroupReferenceStatement.ARN}`);
                  }
                }
                
                // Verificar VisibilityConfig
                if (rule.VisibilityConfig) {
                  console.log(`           - Métricas: ${rule.VisibilityConfig.MetricName || 'N/A'}`);
                  console.log(`           - Muestreado: ${rule.VisibilityConfig.SampledRequestsEnabled ? 'Sí' : 'No'}`);
                }
                
                console.log('');
              }
            }
            
            // Verificar recursos asociados
            try {
              const listResourcesCommand = new ListResourcesForWebACLCommand({
                WebACLArn: webACL.ARN,
                ResourceType: scope === 'REGIONAL' ? 'APPLICATION_LOAD_BALANCER' : 'CLOUDFRONT'
              });
              const resourcesResponse = await wafClient.send(listResourcesCommand);
              
              if (resourcesResponse.ResourceArns && resourcesResponse.ResourceArns.length > 0) {
                console.log(`\n      🔗 Recursos asociados (${resourcesResponse.ResourceArns.length}):`);
                resourcesResponse.ResourceArns.forEach((arn, idx) => {
                  console.log(`         ${idx + 1}. ${arn}`);
                });
              }
            } catch (resourcesError) {
              // Ignorar errores de recursos (puede no tener permisos o no estar asociado)
            }
          }
        } catch (getError) {
          console.log(`      ⚠️  Error obteniendo detalles: ${getError.message}`);
          if (getError.name === 'AccessDeniedException') {
            console.log(`      💡 No tienes permisos para ver detalles de este Web ACL`);
          }
        }
        
        console.log('\n');
      }
    } catch (error) {
      if (error.name === 'AccessDeniedException') {
        console.log(`   ⚠️  No tienes permisos para acceder a WAF en scope ${scope}`);
        console.log(`   💡 Verifica los permisos IAM: wafv2:ListWebACLs, wafv2:GetWebACL\n`);
      } else {
        console.error(`   ❌ Error verificando WAF en scope ${scope}:`, error.message);
      }
    }
  }
}

async function main() {
  try {
    await checkWAFRateLimiting();
    
    console.log('✅ Verificación completada\n');
    console.log('📝 Notas importantes:');
    console.log('   - Si encontraste rate limiting en WAF, puedes:');
    console.log('     1. Eliminar la regla de rate limiting');
    console.log('     2. Aumentar el límite de la regla');
    console.log('     3. Cambiar la acción de Block a Count para monitorear');
    console.log('   - Para modificar WAF, ve a AWS Console > WAF & Shield > Web ACLs\n');
  } catch (error) {
    console.error('❌ Error general:', error);
    process.exit(1);
  }
}

main();
