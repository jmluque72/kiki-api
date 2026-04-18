/**
 * Sube logo y badges de emails a S3 (prefijo email/assets/).
 * Requiere AWS_* en .env y permisos s3:PutObject.
 * Los objetos deben ser legibles públicamente (política de bucket o CloudFront) para que carguen en el cliente de correo.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const PREFIX = (process.env.EMAIL_ASSETS_S3_PREFIX || 'email/assets').replace(/^\/+|\/+$/g, '');
const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';

// URLs oficiales / estables para descargar y re-subir a S3
const APPLE_SRC =
  'https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/es-419?size=250x83&h=83&w=250';
const GOOGLE_SRC =
  'https://play.google.com/intl/es_es/badges/static/images/badges/es_badge_web_generic.png';

const LOGO_LOCAL = path.join(__dirname, '../assets/logo-kiki.png');

async function main() {
  if (!BUCKET) {
    console.error('Falta AWS_S3_BUCKET_NAME en el entorno.');
    process.exit(1);
  }
  if (!fs.existsSync(LOGO_LOCAL)) {
    console.error('No existe el logo local:', LOGO_LOCAL);
    process.exit(1);
  }

  const client = new S3Client({ region: REGION });

  const uploads = [
    {
      key: `${PREFIX}/logo-kiki.png`,
      body: fs.readFileSync(LOGO_LOCAL),
      contentType: 'image/png',
    },
    {
      key: `${PREFIX}/badge-app-store.png`,
      body: (await axios.get(APPLE_SRC, { responseType: 'arraybuffer' })).data,
      contentType: 'image/png',
    },
    {
      key: `${PREFIX}/badge-google-play.png`,
      body: (await axios.get(GOOGLE_SRC, { responseType: 'arraybuffer' })).data,
      contentType: 'image/png',
    },
  ];

  for (const u of uploads) {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: u.key,
        Body: Buffer.from(u.body),
        ContentType: u.contentType,
        CacheControl: 'public, max-age=31536000',
      })
    );
    console.log('Subido:', u.key);
  }

  const baseUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}`;
  console.log('\nBase pública (virtual-hosted-style):', baseUrl);
  console.log(
    'Con AWS_S3_BUCKET_NAME y AWS_REGION ya en .env, la API usa esta base sola (no hace falta EMAIL_ASSETS_BASE_URL).'
  );
  console.log('Opcional (CloudFront, etc.): EMAIL_ASSETS_BASE_URL=' + baseUrl);
  console.log('\nSi el bucket no es público, añade política GetObject para', PREFIX + '/*', 'o sirve estos objetos vía CloudFront.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
