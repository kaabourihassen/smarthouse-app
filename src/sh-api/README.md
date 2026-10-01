# SmartHouse API (NestJS)

A powerful, scalable backend service built with [NestJS](https://nestjs.com/) designed to power the SmartHouse application. This API handles everything from user authentication and billing to real-time IoT device telemetry via MQTT, providing a robust foundation for smart home management.

## 🚀 Key Features

* **IoT Ingestion via MQTT**: Real-time telemetry ingestion from smart home devices (DHT22, MQ2, Flame sensors, ESP32) using Mosquitto.
* **Smart Alerts & Security**: Auto-generates security events and push notifications when anomalies (like high gas levels or flames) are detected.
* **Stripe Billing & Subscriptions**: Full integration with Stripe for tiered subscription plans, payment processing, and secure webhook handling.
* **Google OAuth Sign-In**: Integrated Google Identity Services (GIS) and standard JWT email/password for secure user authentication.
* **AI Computer Vision (Human Detection)**: Uses TensorFlow.js (`coco-ssd`) to analyze camera streams and screenshots for human presence, automatically triggering security recordings and alerts.
* **FFmpeg Video Processing**: Seamlessly spawns `ffmpeg` processes to record detection events to `.mp4` and extract high-quality screenshots on demand.
* **Real-time WebSockets**: Employs Socket.IO to emit instant live push notifications to the frontend client when alerts (e.g. fire, gas, motion) trigger.
* **Secure MJPEG Stream Relay**: Proxies external IP camera streams securely through the backend to protect sensitive camera credentials from being exposed on the frontend.
* **AI-Powered Complaint Moderation**: User complaints are automatically moderated server-side using the OpenAI API to ensure safe communication.
* **Admin Management**: Dedicated endpoints for administrators to oversee users, system readings, complaints, and subscriptions.

## 🏗️ Architecture (Domain-Driven Design)

The codebase follows a modular Domain-Driven Design (DDD) approach to ensure maintainability:
* `iam` (Identity & Access): Handles Authentication, JWT strategies, Google OAuth, and User profiles.
* `iot` (Internet of Things): Manages Rooms, Devices (sensors, actuators), Cameras, and Camera Recordings/Screenshots.
* `billing_domain`: Manages Stripe Subscriptions, Invoicing, and Webhooks.
* `core_domain`: Manages system-wide concerns like Admin operations, Notifications, User Complaints, and Event History tracking.

## 🛠️ Tech Stack

* **Framework**: NestJS (Node.js/TypeScript)
* **Database**: MongoDB (Mongoose)
* **IoT Protocol**: MQTT (via Mosquitto)
* **Real-time Communication**: WebSockets (Socket.IO)
* **Video Processing**: FFmpeg
* **Authentication**: JWT & Google OAuth
* **Payments**: Stripe API
* **AI Integration**: OpenAI API & TensorFlow.js

---

## ⚙️ Configuration & Environment Variables

Copy the provided example environment file and configure it with your credentials:

```bash
cp .env.example .env
```

### Essential Environment Variables
* `PORT` - The port the API runs on (default: `3000`)
* `MONGODB_URI` - MongoDB connection string
* `JWT_SECRET` / `JWT_EXPIRES_IN` - JWT authentication settings
* `OPENAI_API_KEY` - API key for AI complaint moderation
* `GOOGLE_CLIENT_ID` - Google OAuth Web Client ID

### Stripe Configuration
* `STRIPE_SECRET_KEY` - Your secret Stripe API key
* `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
* `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PREMIUM_PLUS`, `STRIPE_PRICE_EXTENDED_PRO` - Price IDs for subscription tiers

### MQTT Configuration (Optional)
To enable IoT telemetry ingestion:
* `MQTT_INGEST_ENABLED=true`
* `MQTT_URL` or `MQTT_HOST` & `MQTT_PORT` - Your MQTT broker details
* `MQTT_INGEST_USER_ID` - Default user ID for incoming telemetry data

---

## 🏃 Getting Started

### Prerequisites
* Node.js (v18+)
* MongoDB instance running
* Mosquitto MQTT broker (optional, for IoT ingestion)

### Installation

```bash
$ npm install
```

### Running the API

```bash
# Development mode
$ npm run start

# Watch mode (recommended for local development)
$ npm run start:dev

# Production mode
$ npm run start:prod
```

## 🧪 Testing

```bash
# Unit tests
$ npm run test

# E2E tests
$ npm run test:e2e

# Test coverage
$ npm run test:cov
```

## 📄 License
This project is [MIT licensed](LICENSE).
