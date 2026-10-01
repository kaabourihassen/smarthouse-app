Param(
    [string]$Namespace = "smarthouse",
    [string]$ReleaseName = "smarthouse"
)

$ErrorActionPreference = "Stop"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Smart House Kubernetes & Helm Deployment Pipeline " -ForegroundColor Cyan
Write-Host " Target Namespace: $Namespace" -ForegroundColor Yellow
Write-Host " Release Name:     $ReleaseName" -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Cyan

# Check CLI prerequisites
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Error "Docker CLI is required."; exit 1 }
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { Write-Error "kubectl CLI is required."; exit 1 }
if (-not (Get-Command helm -ErrorAction SilentlyContinue)) { Write-Error "Helm CLI is required."; exit 1 }

Write-Host "[1/4] Building Docker container images..." -ForegroundColor Green
docker build -t smarthouse-api:latest -f .infra/dockerfiles/api.dockerfile --target production ./src/sh-api
docker build -t smarthouse-client:latest -f .infra/dockerfiles/client.dockerfile --target production ./src/sh-client

$ctx = (kubectl config current-context 2>$null)
if ($ctx -like "*minikube*") {
    Write-Host "[+] Minikube context detected. Loading images..." -ForegroundColor Green
    minikube image load smarthouse-api:latest
    minikube image load smarthouse-client:latest
}

Write-Host "[2/4] Linting Helm chart..." -ForegroundColor Green
helm lint ./.infra/helm/smarthouse

Write-Host "[3/4] Deploying/Upgrading Helm release to Kubernetes..." -ForegroundColor Green
helm upgrade --install $ReleaseName ./.infra/helm/smarthouse --namespace $Namespace --create-namespace --wait --timeout 10m

Write-Host "[4/4] Deployment Status Summary:" -ForegroundColor Green
kubectl get pods,services,ingress,hpa -n $Namespace

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "[+] Kubernetes Deployment Completed Successfully!" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
