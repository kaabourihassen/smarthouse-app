# Smart Home Management Platform (smarthouse-app)

![Architecture](https://img.shields.io/badge/Architecture-DDD-blue?style=for-the-badge)
![Frontend](https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![Backend](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Infrastructure](https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)
![IoT](https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=mqtt&logoColor=white)

## 📖 Project Overview
This repository contains a full-stack, enterprise-grade **Smart Home Management Platform**. It was built to demonstrate how to architect, develop, and deploy a scalable Internet of Things (IoT) system.

The application allows users (residents and admins) to securely monitor and control their smart home environments. Users can view live camera feeds, control smart devices across different rooms, monitor their energy consumption in real-time, and manage their subscriptions—all through a responsive web interface.

This project was developed with a strong focus on **scalability, clean architecture, and modern DevOps practices**, making it robust enough to handle real-world traffic and data ingestion.

---

## ✨ Key Features
- **Centralized Dashboard:** A real-time overview of home status, active devices, and recent alerts.
- **IoT Device & Room Management:** Control lights, thermostats, and sensors. Devices are grouped logically by rooms.
- **Camera & Video Streaming:** Live streaming of IP cameras and historical recording management.
- **Energy Monitoring:** Track power consumption to optimize energy efficiency.
- **Role-Based Access Control (RBAC):** Secure access separated into Admin and Resident portals.
- **Billing & Subscriptions:** Automated billing flows and webhooks (via Stripe) for premium features.
- **Ticketing System:** Users can easily submit and track complaints or maintenance requests.

---

## 🛠️ Architecture & Tech Stack

The application is split into specialized micro-frontends and backends, following industry best practices for separation of concerns.

### Frontend: Angular (`sh-client`)
- **Framework:** Angular (Standalone Components)
- **Architecture:** Feature-Based Architecture (Core, Shared, and Feature modules).
- **Styling:** SCSS with modern responsive design principles.
- **Highlight:** The UI is cleanly separated by domains (Dashboard, Admin, Auth) to ensure the codebase remains maintainable as the application grows.

### Backend: NestJS (`sh-api`)
- **Framework:** NestJS (Node.js)
- **Architecture:** Domain-Driven Design (DDD). The API is divided into strict bounded contexts:
  - `iam/` (Identity & Access Management)
  - `iot/` (Internet of Things & MQTT ingestion)
  - `billing_domain/` (Subscriptions & Payments)
  - `core_domain/` (Admin & Platform features)
- **Database:** MongoDB (via Mongoose) for flexible, high-speed document storage.
- **IoT Protocol:** MQTT for low-latency, real-time communication with smart sensors and devices.

---

## ☁️ Infrastructure & DevOps (`.infra`)
The infrastructure has been designed with a "Cloud-Native" mindset, ensuring high availability, observability, and ease of deployment.

- **Containerization:** All services are fully Dockerized (`api.dockerfile`, `client.dockerfile`).
- **Orchestration:** Kubernetes (K8s) manifests and Helm charts are used to orchestrate the containers, handle scaling, and manage networking.
- **Observability:** Integrated with **Prometheus** and **Grafana** for real-time monitoring of cluster health, API performance, and hardware metrics (via Node Exporter).
- **Reverse Proxy:** NGINX is configured for traffic routing and load balancing.
- **Local Environment:** A `Makefile` and Docker Compose setup is provided for seamless local development (`make dciup-dev`).

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Docker & Docker Compose
- Node.js (v18+)
- Make (optional, for convenience scripts)

### Running the App
1. **Clone the repository:**
   ```bash
   git clone https://github.com/kaabourihassen/smarthouse-app.git
   cd smarthouse-app
   ```

2. **Start the infrastructure (Databases, Message Brokers, API, and Client):**
   ```bash
   make dciup-dev
   # Or using docker compose directly:
   # docker compose -f .infra/compose/docker-compose.dev.yml up -d
   ```

3. **Access the application:**
   - **Frontend:** http://localhost:4200
   - **Backend API:** http://localhost:3000

---

## ☸️ Kubernetes Production Deployment

To deploy this application to a live Kubernetes cluster, a deployment script is provided to streamline the process. 

### Prerequisites
- A running Kubernetes cluster (e.g., EKS, GKE, AKS, or Minikube for testing)
- `kubectl` configured with cluster access
- `helm` installed on your machine

### Deployment Steps
1. **Provision the Infrastructure:**
   Run the provided deployment script which automatically provisions the required namespaces, databases, messaging brokers, and the application services:
   ```bash
   make k8s-deploy
   # Alternatively, you can run the script directly:
   # bash .infra/k8s/deploy-k8s.sh
   ```

2. **Verify Deployment Status:**
   Check the status of the pods, services, and ingresses:
   ```bash
   make k8s-status
   ```

3. **Monitoring (Prometheus & Grafana):**
   The deployment includes an observability stack. You can access the Grafana dashboard to monitor cluster health and application metrics once the pods are fully spun up.

---

*This project was built to showcase advanced software engineering, cloud architecture, and DevOps skills. Feel free to explore the codebase!*
