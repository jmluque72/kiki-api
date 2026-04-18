/**
 * Añade (o fusiona) una política de bucket para permitir lectura anónima solo en email/assets/*.
 * Requiere permisos s3:GetBucketPolicy, s3:PutBucketPolicy y que "Block public access"
 * permita políticas públicas en este bucket (si no, AWS devuelve error).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const {
  S3Client,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
  GetPublicAccessBlockCommand,
} = require('@aws-sdk/client-s3');

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION || 'us-east-1';
const PREFIX = (process.env.EMAIL_ASSETS_S3_PREFIX || 'email/assets').replace(/^\/+|\/+$/g, '');
const STATEMENT_SID = 'KikiEmailAssetsPublicReadGetObject';

function buildStatement(bucket, prefix) {
  return {
    Sid: STATEMENT_SID,
    Effect: 'Allow',
    Principal: '*',
    Action: 's3:GetObject',
    Resource: `arn:aws:s3:::${bucket}/${prefix}/*`,
  };
}

async function main() {
  if (!BUCKET) {
    console.error('Falta AWS_S3_BUCKET_NAME.');
    process.exit(1);
  }

  const client = new S3Client({ region: REGION });

  try {
    const pab = await client.send(
      new GetPublicAccessBlockCommand({ Bucket: BUCKET })
    );
    const cfg = pab.PublicAccessBlockConfiguration || {};
    if (cfg.BlockPublicPolicy === true || cfg.RestrictPublicBuckets === true) {
      console.error(
        'El bucket tiene Block Public Access activo (BlockPublicPolicy o RestrictPublicBuckets).'
      );
      console.error(
        'En la consola AWS → S3 → el bucket → Permissions → Block public access: permite políticas de bucket para este bucket, o ajusta con la CLI.'
      );
      process.exit(1);
    }
  } catch (e) {
    if (e.name !== 'NoSuchPublicAccessBlockConfiguration') {
      throw e;
    }
  }

  let policy = { Version: '2012-10-17', Statement: [] };

  try {
    const { Policy: existing } = await client.send(
      new GetBucketPolicyCommand({ Bucket: BUCKET })
    );
    policy = JSON.parse(existing);
    if (!Array.isArray(policy.Statement)) {
      policy.Statement = [policy.Statement].filter(Boolean);
    }
  } catch (e) {
    if (e.name !== 'NoSuchBucketPolicy') {
      throw e;
    }
  }

  const hasSid = policy.Statement.some((s) => s && s.Sid === STATEMENT_SID);
  if (hasSid) {
    console.log('La política ya incluye', STATEMENT_SID, '— no se modificó nada.');
    return;
  }

  policy.Statement.push(buildStatement(BUCKET, PREFIX));

  await client.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify(policy),
    })
  );

  console.log('Listo: GetObject público para', `arn:aws:s3:::${BUCKET}/${PREFIX}/*`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
