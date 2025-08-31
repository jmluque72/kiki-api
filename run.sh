docker build --platform linux/amd64 -t kikiapi .
docker tag kikiapi:latest 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:latest
aws ecr get-login-password --region us-east-1 --profile mio | docker login --username AWS --password-stdin 638579994720.dkr.ecr.us-east-1.amazonaws.com
docker push 638579994720.dkr.ecr.us-east-1.amazonaws.com/kiki-api:latest

