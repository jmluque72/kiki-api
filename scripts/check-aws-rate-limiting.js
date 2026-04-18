require('dotenv').config();
const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand, DescribeRulesCommand, DescribeListenersCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
const { ECSClient, DescribeServicesCommand, ListServicesCommand, DescribeClustersCommand } = require('@aws-sdk/client-ecs');
const { CloudWatchClient, GetMetricStatisticsCommand } = require('@aws-sdk/client-cloudwatch');

// Configuración de AWS
const awsConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// Clientes AWS
const elbv2Client = new ElasticLoadBalancingV2Client(awsConfig);
const ecsClient = new ECSClient(awsConfig);
const cloudWatchClient = new CloudWatchClient(awsConfig);

console.log('🔍 Verificando configuración de AWS para rate limiting...\n');
console.log('📋 Configuración AWS:');
console.log(`   - Región: ${awsConfig.region}`);
console.log(`   - Access Key ID: ${awsConfig.credentials.accessKeyId ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`   - Secret Access Key: ${awsConfig.credentials.secretAccessKey ? '✅ Configurado' : '❌ No configurado'}\n`);

if (!awsConfig.credentials.accessKeyId || !awsConfig.credentials.secretAccessKey) {
  console.error('❌ Error: AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY deben estar configurados en .env');
  process.exit(1);
}

async function checkALBRateLimiting() {
  console.log('🔍 [ALB] Verificando Application Load Balancers...\n');
  
  try {
    // Obtener todos los ALBs
    const describeLBCommand = new DescribeLoadBalancersCommand({});
    const lbResponse = await elbv2Client.send(describeLBCommand);
    
    if (!lbResponse.LoadBalancers || lbResponse.LoadBalancers.length === 0) {
      console.log('⚠️  No se encontraron Application Load Balancers\n');
      return;
    }
    
    console.log(`📊 Se encontraron ${lbResponse.LoadBalancers.length} Load Balancer(s):\n`);
    
    for (const lb of lbResponse.LoadBalancers) {
      console.log(`🔹 Load Balancer: ${lb.LoadBalancerName}`);
      console.log(`   - ARN: ${lb.LoadBalancerArn}`);
      console.log(`   - DNS: ${lb.DNSName}`);
      console.log(`   - Estado: ${lb.State?.Code}`);
      console.log(`   - Tipo: ${lb.Type}`);
      console.log(`   - Esquema: ${lb.Scheme}`);
      
      // Verificar reglas del listener (donde se configuran rate limiting)
      try {
        const describeListenersCommand = new DescribeListenersCommand({
          LoadBalancerArn: lb.LoadBalancerArn
        });
        const listenersResponse = await elbv2Client.send(describeListenersCommand);
        
        if (listenersResponse.Listeners && listenersResponse.Listeners.length > 0) {
          console.log(`\n   📋 Listeners (${listenersResponse.Listeners.length}):`);
          
          for (const listener of listenersResponse.Listeners) {
            console.log(`      - Listener: ${listener.ListenerArn}`);
            console.log(`        Puerto: ${listener.Port}`);
            console.log(`        Protocolo: ${listener.Protocol}`);
            
            // Verificar reglas del listener
            if (listener.DefaultActions) {
              console.log(`        Default Actions: ${listener.DefaultActions.length}`);
            }
            
            // Obtener reglas del listener
            try {
              const describeRulesCommand = new DescribeRulesCommand({
                ListenerArn: listener.ListenerArn
              });
              const rulesResponse = await elbv2Client.send(describeRulesCommand);
              
              if (rulesResponse.Rules && rulesResponse.Rules.length > 0) {
                console.log(`\n        📜 Reglas (${rulesResponse.Rules.length}):`);
                
                for (const rule of rulesResponse.Rules) {
                  console.log(`           - Regla: ${rule.RuleArn || 'Default'}`);
                  console.log(`             Prioridad: ${rule.Priority || 'default'}`);
                  
                  // Verificar acciones de rate limiting
                  if (rule.Actions) {
                    const rateLimitActions = rule.Actions.filter(action => 
                      action.Type === 'fixed-response' && 
                      action.FixedResponseConfig?.StatusCode === 429
                    );
                    
                    if (rateLimitActions.length > 0) {
                      console.log(`             ⚠️  RATE LIMITING DETECTADO:`);
                      console.log(`                - Acciones de rate limiting: ${rateLimitActions.length}`);
                      rateLimitActions.forEach((action, idx) => {
                        console.log(`                - Acción ${idx + 1}: ${JSON.stringify(action, null, 18)}`);
                      });
                    }
                  }
                  
                  // Verificar condiciones (podrían incluir rate limiting)
                  if (rule.Conditions) {
                    const rateLimitConditions = rule.Conditions.filter(condition =>
                      condition.Field === 'http-header' &&
                      condition.HttpHeaderConfig?.HttpHeaderName?.toLowerCase().includes('rate')
                    );
                    
                    if (rateLimitConditions.length > 0) {
                      console.log(`             ⚠️  CONDICIONES DE RATE LIMITING:`);
                      rateLimitConditions.forEach((condition, idx) => {
                        console.log(`                - Condición ${idx + 1}: ${JSON.stringify(condition, null, 18)}`);
                      });
                    }
                  }
                }
              }
            } catch (rulesError) {
              console.log(`        ⚠️  Error obteniendo reglas: ${rulesError.message}`);
            }
          }
        }
      } catch (listenersError) {
        console.log(`   ⚠️  Error obteniendo listeners: ${listenersError.message}`);
      }
      
      // Verificar Target Groups
      try {
        const describeTGCommand = new DescribeTargetGroupsCommand({
          LoadBalancerArn: lb.LoadBalancerArn
        });
        const tgResponse = await elbv2Client.send(describeTGCommand);
        
        if (tgResponse.TargetGroups && tgResponse.TargetGroups.length > 0) {
          console.log(`\n   🎯 Target Groups (${tgResponse.TargetGroups.length}):`);
          tgResponse.TargetGroups.forEach(tg => {
            console.log(`      - ${tg.TargetGroupName}`);
            console.log(`        ARN: ${tg.TargetGroupArn}`);
            console.log(`        Puerto: ${tg.Port}`);
            console.log(`        Protocolo: ${tg.Protocol}`);
            console.log(`        Health Check: ${tg.HealthCheckEnabled ? '✅' : '❌'}`);
          });
        }
      } catch (tgError) {
        console.log(`   ⚠️  Error obteniendo target groups: ${tgError.message}`);
      }
      
      console.log('\n');
    }
  } catch (error) {
    console.error('❌ Error verificando ALBs:', error.message);
    if (error.name === 'AccessDeniedException') {
      console.error('   ⚠️  No tienes permisos para acceder a ELB. Verifica los permisos IAM.');
    }
  }
}

async function checkECSRateLimiting() {
  console.log('🔍 [ECS] Verificando ECS Services...\n');
  
  try {
    // Obtener todos los clusters
    const describeClustersCommand = new DescribeClustersCommand({});
    const clustersResponse = await ecsClient.send(describeClustersCommand);
    
    if (!clustersResponse.clusters || clustersResponse.clusters.length === 0) {
      console.log('⚠️  No se encontraron ECS Clusters\n');
      return;
    }
    
    console.log(`📊 Se encontraron ${clustersResponse.clusters.length} Cluster(s):\n`);
    
    for (const cluster of clustersResponse.clusters) {
      console.log(`🔹 Cluster: ${cluster.clusterName}`);
      console.log(`   - ARN: ${cluster.clusterArn}`);
      console.log(`   - Estado: ${cluster.status}`);
      console.log(`   - Tareas activas: ${cluster.activeTasksCount || 0}`);
      console.log(`   - Servicios activos: ${cluster.activeServicesCount || 0}`);
      
      // Obtener servicios del cluster
      try {
        const listServicesCommand = new ListServicesCommand({
          cluster: cluster.clusterName
        });
        const servicesResponse = await ecsClient.send(listServicesCommand);
        
        if (servicesResponse.serviceArns && servicesResponse.serviceArns.length > 0) {
          console.log(`\n   📋 Servicios (${servicesResponse.serviceArns.length}):`);
          
          // Describir cada servicio
          for (const serviceArn of servicesResponse.serviceArns) {
            try {
              const describeServiceCommand = new DescribeServicesCommand({
                cluster: cluster.clusterName,
                services: [serviceArn]
              });
              const serviceResponse = await ecsClient.send(describeServiceCommand);
              
              if (serviceResponse.services && serviceResponse.services.length > 0) {
                const service = serviceResponse.services[0];
                console.log(`      - Servicio: ${service.serviceName}`);
                console.log(`        ARN: ${service.serviceArn}`);
                console.log(`        Estado: ${service.status}`);
                console.log(`        Tareas deseadas: ${service.desiredCount}`);
                console.log(`        Tareas ejecutándose: ${service.runningCount}`);
                
                // Verificar configuración de auto-scaling (podría afectar rate limiting)
                if (service.deploymentConfiguration) {
                  console.log(`        Configuración de despliegue:`);
                  console.log(`          - Máximo %: ${service.deploymentConfiguration.maximumPercentPercent || 'N/A'}`);
                  console.log(`          - Mínimo %: ${service.deploymentConfiguration.minimumHealthyPercent || 'N/A'}`);
                }
                
                // Verificar load balancer asociado
                if (service.loadBalancers && service.loadBalancers.length > 0) {
                  console.log(`        Load Balancers asociados: ${service.loadBalancers.length}`);
                  service.loadBalancers.forEach((lb, idx) => {
                    console.log(`          - LB ${idx + 1}: ${lb.loadBalancerName || lb.targetGroupArn}`);
                  });
                }
              }
            } catch (serviceError) {
              console.log(`      ⚠️  Error describiendo servicio ${serviceArn}: ${serviceError.message}`);
            }
          }
        }
      } catch (servicesError) {
        console.log(`   ⚠️  Error obteniendo servicios: ${servicesError.message}`);
      }
      
      console.log('\n');
    }
  } catch (error) {
    console.error('❌ Error verificando ECS:', error.message);
    if (error.name === 'AccessDeniedException') {
      console.error('   ⚠️  No tienes permisos para acceder a ECS. Verifica los permisos IAM.');
    }
  }
}

async function checkCloudWatchMetrics() {
  console.log('🔍 [CloudWatch] Verificando métricas de rate limiting...\n');
  
  try {
    // Buscar métricas relacionadas con rate limiting
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 3600000); // Última hora
    
    // Métricas comunes de ALB que podrían indicar rate limiting
    const metrics = [
      { Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_Target_4XX_Count' },
      { Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_ELB_4XX_Count' },
      { Namespace: 'AWS/ApplicationELB', MetricName: 'RequestCount' },
    ];
    
    console.log('📊 Métricas de ALB (última hora):');
    for (const metric of metrics) {
      try {
        const getMetricCommand = new GetMetricStatisticsCommand({
          Namespace: metric.Namespace,
          MetricName: metric.MetricName,
          StartTime: startTime,
          EndTime: endTime,
          Period: 300, // 5 minutos
          Statistics: ['Sum', 'Average']
        });
        
        const metricResponse = await cloudWatchClient.send(getMetricCommand);
        
        if (metricResponse.Datapoints && metricResponse.Datapoints.length > 0) {
          console.log(`   - ${metric.MetricName}:`);
          const total = metricResponse.Datapoints.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
          const avg = metricResponse.Datapoints.reduce((sum, dp) => sum + (dp.Average || 0), 0) / metricResponse.Datapoints.length;
          console.log(`     Total: ${total}`);
          console.log(`     Promedio: ${avg.toFixed(2)}`);
        }
      } catch (metricError) {
        // Ignorar errores de métricas no disponibles
      }
    }
  } catch (error) {
    console.error('❌ Error verificando CloudWatch:', error.message);
  }
  
  console.log('\n');
}

async function main() {
  try {
    await checkALBRateLimiting();
    await checkECSRateLimiting();
    await checkCloudWatchMetrics();
    
    console.log('✅ Verificación completada\n');
    console.log('📝 Notas importantes:');
    console.log('   - ALB no tiene rate limiting nativo, pero puede estar configurado en:');
    console.log('     * AWS WAF (Web Application Firewall)');
    console.log('     * AWS API Gateway (si se usa)');
    console.log('     * Reglas de listener personalizadas');
    console.log('   - ECS no aplica rate limiting directamente');
    console.log('   - Verifica también AWS WAF si está configurado\n');
  } catch (error) {
    console.error('❌ Error general:', error);
    process.exit(1);
  }
}

main();

