# SmartHouse Client (Angular)

The modern, responsive web frontend for the SmartHouse application, built with [Angular](https://angular.io/). This client interface provides users with an intuitive dashboard to manage their smart home devices, view live telemetry, manage subscriptions, and interact with the SmartHouse ecosystem.

## 🚀 Key Features

### 🏠 User Dashboard
* **Device Management**: Add, configure, and effortlessly control smart home devices from a centralized interface.
* **Camera Feeds & AI Detection**: Access live security camera streams and review historical recordings or captured screenshots. Features AI-powered human detection that automatically triggers event recordings.
* **Energy Management**: Monitor your energy usage metrics and track electricity costs based on real-time data.
* **History & Notifications**: Stay informed with a chronological history timeline of system events and real-time push alerts powered by **WebSockets (Socket.IO)**.
* **Subscriptions & Profile**: Seamlessly upgrade your subscription tier (Basic, Premium Plus, Extended Pro) powered by Stripe, and manage your user profile.
* **Complaints System**: Submit support complaints (which are AI-moderated on the backend).

### 🛡️ Admin Portal
* **System Overview**: Dedicated administrative interface for overseeing the entire SmartHouse platform.
* **User Management**: Monitor user accounts, assign roles, and handle access control.
* **Global Readings**: Review system-wide device metrics and sensor readings.
* **Complaint Resolution**: Address and manage user complaints efficiently.
* **Subscription Tracking**: Oversee active subscriptions and revenue metrics.

### 🔐 Security & Access
* **Authentication**: Traditional email/password sign-in alongside secure Google OAuth integration.
* **Role-based Access Control**: Distinct routing and UI experiences for standard users vs. administrators.

## 🛠️ Tech Stack

* **Framework**: Angular
* **Styling**: SCSS (Sass)
* **Language**: TypeScript
* **Real-time Engine**: Socket.IO-client
* **State Management / Architecture**: Core & Shared module patterns

---

## ⚙️ Configuration

Ensure you have your environment configured before running the application. The application requires an API endpoint and a Google Client ID to function fully.

1. Ensure your backend (`sh-api`) is running locally or deployed.
2. In your `src/index.html` (or environments file), set up your Google OAuth Web Client ID for authentication.

---

## 🏃 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18+)
* [Angular CLI](https://angular.io/cli) installed globally (`npm install -g @angular/cli`)

### Installation

Clone the repository and install the required dependencies:

```bash
$ cd sh-client
$ npm install
```

### Development Server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

```bash
$ npm start
# OR
$ ng serve
```

## 🏗️ Build & Deployment

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

```bash
# Production build
$ ng build --configuration production
```
For cloud deployments, Dockerfiles and Kubernetes Helm charts are available in the `.infra` directory at the repository root.

## 🧪 Testing

```bash
# Execute unit tests via Karma
$ ng test
```

## 📄 License
This project is [MIT licensed](LICENSE).
