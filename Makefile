DOCKER_COMPOSE_RUN ?= docker-compose run --rm
DOCKER_COMPOSE_RUN_DB ?= $(DOCKER_COMPOSE_RUN) db
DOCKER_COMPOSE_DEV_FILE ?= .infra/compose/docker-compose.dev.yml
DOCKER_COMPOSE_PROD_FILE ?= .infra/compose/docker-compose.production.yml

dciup-dev:
	docker compose -f $(DOCKER_COMPOSE_DEV_FILE) up -d

dci-dev-build:
	docker compose -f $(DOCKER_COMPOSE_DEV_FILE) build --no-cache

 dciup-prod:
	 docker compose -f $(DOCKER_COMPOSE_PROD_FILE) up -d

 dci-prod-build:
	 docker compose -f $(DOCKER_COMPOSE_PROD_FILE) build --no-cache

install-db:
	$(DOCKER_COMPOSE_RUN_DB) sh /docker-entrypoint-initdb.d/initdb.sh

dci-down:
	docker compose -f $(DOCKER_COMPOSE_DEV_FILE) down

dci-down-v:
	docker compose -f $(DOCKER_COMPOSE_DEV_FILE) down -v

dci-api-shell:
	docker exec -it sh-api sh


	:
	docker exec -it sh-client sh

dci-db-shell:
	docker exec -it sh-db sh

dci-prune:
	docker system prune -af

# Kubernetes & Helm Deployment Targets
k8s-deploy:
	bash .infra/k8s/deploy-k8s.sh

k8s-status:
	kubectl get pods,svc,ingress,hpa -n smarthouse

k8s-down:
	helm uninstall smarthouse -n smarthouse

helm-lint:
	helm lint .infra/helm/smarthouse