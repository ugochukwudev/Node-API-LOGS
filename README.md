# Node API Logs

A comprehensive API logging and monitoring system for Node.js + Express applications that tracks, analyzes, and visualizes API requests in real-time. Built with Node.js, Express, and MongoDB, this system provides detailed insights into your API's performance, errors, and usage patterns.

> **Note**: Currently supports Node.js + Express applications only. Support for other frameworks (like NestJS) will be added in future releases.

![Login Screen](https://i.ibb.co/3y0tNx4j/Screenshot-2025-04-28-at-11-55-13-AM.png)
![Dashboard](https://i.ibb.co/0RsK15rJ/Screenshot-2025-04-28-at-11-57-54-AM.png)
![Logs View](https://i.ibb.co/9kNHwT8C/Screenshot-2025-04-28-at-12-00-01-PM.png)
![Log Details](https://i.ibb.co/9fW9crT/Screenshot-2025-04-28-at-12-01-04-PM.png)

## Prerequisites

- Node.js (v14 or higher)
- Express.js application
- MongoDB database

## Features

### 1. Real-time API Monitoring

- Track all API requests in real-time
- Monitor response times, session logs, status codes, and request/response bodies
- Filter logs by endpoint, date, time, and status code

### 2. Comprehensive Dashboard

- Visual metrics for total requests, average response time, and error rates
- Interactive charts showing status code trends
- System resource monitoring (CPU, Memory, Uptime)
- Top 5 slowest endpoints analysis

### 3. Detailed Log Analysis

- View complete request and response details
- Inspect headers and session logs
- Copy request/response data with one click
- Navigate through paginated log history

### 4. Security Features

- Role-based access control (Admin/Dev roles)
- Secure authentication with JWT
- Protected dashboard and logs access
- Session management

## Installation

1. Install the package:

```bash
npm install api-logger
```

2. Configure your Express application:

```javascript
const express = require("express");
const app = express();
const { createExpressLogger } = require("api-logger");

// Important: Place other middleware before createExpressLogger
app.use(function (req, res, next) {
	logger.info(`[${req.method}] ${req.baseUrl}${req.url}`);
	next();
});

// Initialize the logger after other middleware
createExpressLogger({
	app,
	mongoUri: "mongodb://localhost:27017/your-database",
	beginswith: ["/api"], // Optional: Only log requests starting with these paths
	specifics: ["/auth"], // Optional: Exclude these paths from logging
});
```

## Usage

### Accessing the Dashboard

1. Navigate to `/logs/login` in your browser
2. Log in with your credentials:
   - First user to log in becomes an admin
   - Subsequent users are assigned dev role
   - Password is set on first login

### Dashboard Features

#### Home Page (`/logs/home`)

- View real-time metrics and system stats
- Monitor API performance trends
- Track system resource usage
- Identify slow endpoints

#### Logs Page (`/logs`)

- Browse all API requests
- Filter logs by:
  - Endpoint
  - Date and time
  - Status code
- View paginated results
- Sort and search through logs

#### Log Details (`/logs/:id`)

- View complete request details
- Inspect request and response bodies
- Check headers and session logs
- Copy data for debugging

#### Settings (`/logs/settings`)

- Manage your account
- Log out securely

## Configuration Options

The `createExpressLogger` function accepts the following parameters:

- `app`: Your Express application instance
- `mongoUri`: MongoDB connection string
- `beginswith`: Array of path prefixes to log (optional)
- `specifics`: Array of paths to exclude from logging (optional)

## Troubleshooting

### Middleware Ordering

The order of middleware in Express is crucial. If you're using other logging middleware, make sure to place it before `createExpressLogger`. For example:

```javascript
// Correct order:
app.use(function (req, res, next) {
	logger.info(`[${req.method}] ${req.baseUrl}${req.url}`);
	next();
});

createExpressLogger({
	/* config */
});

// Incorrect order (may cause issues):
createExpressLogger({
	/* config */
});
app.use(function (req, res, next) {
	logger.info(`[${req.method}] ${req.baseUrl}${req.url}`);
	next();
});
```

## Security

- All dashboard routes are protected by JWT authentication
- First-time login creates an admin account
- Subsequent logins create dev accounts
- Session tokens expire after 1 hour
- Secure cookie-based authentication

## Roadmap

- [ ] Add support for NestJS applications
- [ ] Add support for other Node.js frameworks
- [ ] Implement real-time WebSocket updates
- [ ] Add custom alert configurations
- [ ] Support for multiple database types

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
