#!/usr/bin/env bash
set -e

NAMESPACE="${1:-smarthouse}"
RELEASE_NAME="${2:-smarthouse}"
HELM_CHART_PATH="./.infra/helm/smarthouse"

echo "===================================================="
echo " Smart House Kubernetes & Helm Deployment Pipeline "
echo " Target Namespace: ${NAMESPACE}"
echo " Release Name:     ${RELEASE_NAME}"
echo "===================================================="

# Check CLI prerequisites
command -v docker >/dev/null 2>&1 || { echo "[-] Docker CLI is required but not installed. Aborting."; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "[-] kubectl CLI is required but not installed. Aborting."; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "[-] Helm CLI is required but not installed. Aborting."; exit 1; }

echo "[1/4] Building Docker container images..."
docker build -t smarthouse-api:latest -f .infra/dockerfiles/api.dockerfile --target production ./src/sh-api
docker build -t smarthouse-client:latest -f .infra/dockerfiles/client.dockerfile --target production ./src/sh-client

# Check if using local Kubernetes context (minikube/kind)
CURRENT_CTX=$(kubectl config current-context 2>/dev/null || echo "")
if [[ "$CURRENT_CTX" == "minikube"* ]]; then
  echo "[+] Minikube context detected. Loading images..."
  minikube image load smarthouse-api:latest
  minikube image load smarthouse-client:latest
elif [[ "$CURRENT_CTX" == "kind-"* ]]; then
  echo "[+] Kind context detected. Loading images..."
  kind load docker-image smarthouse-api:latest
  kind load docker-image smarthouse-client:latest
fi

echo "[2/4] Linting Helm chart..."
helm lint "${HELM_CHART_PATH}"

echo "[3/4] Deploying/Upgrading Helm release to Kubernetes..."
helm upgrade --install "${RELEASE_NAME}" "${HELM_CHART_PATH}" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --wait \
  --timeout 10m

echo "[4/4] Deployment Status Summary:"
kubectl get pods,services,ingress,hpa -n "${NAMESPACE}"

echo "===================================================="
echo "[+] Kubernetes Deployment Completed Successfully!"
echo "===================================================="
