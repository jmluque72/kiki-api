const { SESClient, GetSendQuotaCommand, GetSendStatisticsCommand, ListIdentitiesCommand, GetIdentityVerificationAttributesCommand } = require('@aws-sdk/client-ses');
require('dotenv').config();

async function fixSESSpam() {
  try {
    console.log('🔍 Diagnosticando problemas de spam con AWS SES...\n');

    // Verificar variables de entorno
    console.log('1️⃣ Verificando configuración:');
    console.log(`   AWS_REGION: ${process.env.AWS_REGION || 'No definido'}`);
    console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Definido' : '❌ No definido'}`);
    console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Definido' : '❌ No definido'}`);
    console.log(`   FROM_EMAIL: sender@kiki.com.ar`);

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.log('\n❌ Error: Las credenciales de AWS no están configuradas');
      return;
    }

    // Crear cliente SES
    const sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    console.log('\n2️⃣ Verificando estado de la cuenta SES:');
    try {
      const quotaCommand = new GetSendQuotaCommand({});
      const quotaResult = await sesClient.send(quotaCommand);
      
      console.log('   ✅ Cuota obtenida:');
      console.log(`   - Máximo de envíos por 24h: ${quotaResult.Max24HourSend}`);
      console.log(`   - Envíos realizados en 24h: ${quotaResult.SentLast24Hours}`);
      console.log(`   - Máximo de envíos por segundo: ${quotaResult.MaxSendRate}`);
      
      // Verificar si está en sandbox
      if (quotaResult.Max24HourSend <= 200) {
        console.log('   ⚠️  CUENTA EN SANDBOX - Solo puede enviar a emails verificados');
        console.log('   💡 Para salir del sandbox:');
        console.log('      1. Ve a AWS SES Console');
        console.log('      2. Navega a "Account dashboard"');
        console.log('      3. Haz clic en "Request production access"');
        console.log('      4. Completa el formulario');
        console.log('      5. Espera aprobación (24-48 horas)');
      } else {
        console.log('   ✅ Cuenta en producción');
      }
    } catch (error) {
      console.log('   ❌ Error obteniendo cuota:', error.message);
    }

    console.log('\n3️⃣ Verificando identidades:');
    try {
      const identitiesCommand = new ListIdentitiesCommand({ IdentityType: 'EmailAddress' });
      const identitiesResult = await sesClient.send(identitiesCommand);
      
      if (identitiesResult.Identities.length === 0) {
        console.log('   ❌ No hay emails verificados');
      } else {
        console.log('   ✅ Emails verificados:');
        identitiesResult.Identities.forEach((identity, index) => {
          console.log(`   ${index + 1}. ${identity}`);
        });
      }

      // Verificar atributos de verificación
      const verificationCommand = new GetIdentityVerificationAttributesCommand({
        Identities: identitiesResult.Identities
      });
      const verificationResult = await sesClient.send(verificationCommand);
      
      console.log('\n   📊 Estado de verificación:');
      for (const [identity, attributes] of Object.entries(verificationResult.VerificationAttributes)) {
        console.log(`   - ${identity}: ${attributes.VerificationStatus}`);
        if (attributes.VerificationStatus === 'Success') {
          console.log(`     ✅ Verificado el: ${attributes.VerificationToken}`);
        }
      }
    } catch (error) {
      console.log('   ❌ Error verificando identidades:', error.message);
    }

    console.log('\n4️⃣ Verificando estadísticas de envío:');
    try {
      const statsCommand = new GetSendStatisticsCommand({});
      const statsResult = await sesClient.send(statsCommand);
      
      if (statsResult.SendDataPoints.length === 0) {
        console.log('   - No hay estadísticas disponibles');
      } else {
        const recentStats = statsResult.SendDataPoints.slice(-10);
        console.log('   - Últimas estadísticas:');
        recentStats.forEach((stat, index) => {
          console.log(`     ${index + 1}. ${stat.Timestamp}: ${stat.DeliveryAttempts} intentos, ${stat.Bounces} rebotes, ${stat.Complaints} quejas`);
        });
      }
    } catch (error) {
      console.log('   ❌ Error obteniendo estadísticas:', error.message);
    }

    console.log('\n5️⃣ 🚨 SOLUCIONES PARA EVITAR SPAM:');
    console.log('\n   A. Configuración de DNS (IMPORTANTE):');
    console.log('      1. Verifica tu dominio en SES (no solo el email)');
    console.log('      2. Configura registros SPF:');
    console.log('         v=spf1 include:amazonses.com ~all');
    console.log('      3. Configura DKIM en SES Console');
    console.log('      4. Configura DMARC:');
    console.log('         v=DMARC1; p=quarantine; rua=mailto:dmarc@tudominio.com');
    
    console.log('\n   B. Mejoras en el contenido:');
    console.log('      1. Evita palabras que activen filtros de spam');
    console.log('      2. Usa un asunto claro y descriptivo');
    console.log('      3. Incluye un enlace de desuscripción');
    console.log('      4. Mantén una proporción texto/imagen balanceada');
    
    console.log('\n   C. Configuración técnica:');
    console.log('      1. Usa un "From" consistente');
    console.log('      2. Incluye headers apropiados');
    console.log('      3. Configura "Reply-To"');
    console.log('      4. Usa HTML válido');
    
    console.log('\n   D. Monitoreo:');
    console.log('      1. Revisa métricas de bounce rate (< 5%)');
    console.log('      2. Monitorea complaint rate (< 0.1%)');
    console.log('      3. Configura SNS para notificaciones');
    console.log('      4. Revisa logs de CloudWatch');

    console.log('\n6️⃣ 🛠️  PRÓXIMOS PASOS:');
    console.log('   1. Verifica que sender@kiki.com.ar esté verificado en SES');
    console.log('   2. Considera verificar tu dominio completo');
    console.log('   3. Configura registros DNS (SPF, DKIM, DMARC)');
    console.log('   4. Solicita salida del sandbox si es necesario');
    console.log('   5. Monitorea métricas de envío');

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

fixSESSpam();

