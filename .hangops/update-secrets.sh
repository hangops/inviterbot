#!/bin/bash
set -Eeuo pipefail

if [ -f '.secrets.env' ]; then
  source .secrets.env
else
  echo 'no .secrets.env file present'
  exit 1
fi

: ${KUBECTL_CONTEXT:="hangops"}

kubectl --context=${KUBECTL_CONTEXT} create secret generic hangops-slack-api-token --save-config --dry-run=client -o yaml \
  --from-literal=SLACK_API_TOKEN=${HANGOPS_SLACK_API_TOKEN} \
  | kubectl --context=${KUBECTL_CONTEXT} apply -f -

kubectl --context=${KUBECTL_CONTEXT} create secret generic hangops-captcha-config --save-config --dry-run=client -o yaml \
  --from-literal=GOOGLE_CAPTCHA_SECRET=${HANGOPS_GOOGLE_CAPTCHA_SECRET} \
  --from-literal=GOOGLE_CAPTCHA_SITEKEY=${HANGOPS_GOOGLE_CAPTCHA_SITEKEY} \
  | kubectl --context=${KUBECTL_CONTEXT} apply -f -
