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

### 5. Modern User Interface

- **Dark Theme**: Modern, professional dark interface
- **Responsive Design**: Works seamlessly on desktop and mobile
- **Real-time Updates**: Live data refresh and status indicators
- **Interactive Charts**: Beautiful visualizations with Chart.js
- **Debounced Search**: Smart search with 500ms delay for better performance
- **Color-coded Logs**: Visual status indicators for different HTTP status codes
- **Copy to Clipboard**: One-click copying of request/response data

### 6. User Management

- **Admin Controls**: Add and remove users (admin-only)
- **Role Management**: Automatic role assignment (admin/dev)
- **User Settings**: Secure logout and account management
- **Access Control**: Protected routes and API endpoints

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
	app: app as any, // TypeScript support
	mongoUri: "mongodb://localhost:27017/your-database",
	beginswith: ["/api"], // Optional: Only log requests starting with these paths
	specifics: ["/auth"], // Optional: Exclude these paths from logging
});
```

### TypeScript Support

For TypeScript projects, use the following configuration:

```typescript
import express from "express";
import { createExpressLogger } from "api-logger";

const app = express();

// Your middleware here...

createExpressLogger({
	app: app as any, // Type assertion for TypeScript compatibility
	mongoUri:
		process.env.MONGODB_URI || "mongodb://localhost:27017/your-database",
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
- Monitor API performance trends with customizable time ranges (1h, 24h, 7d, 30d)
- Track system resource usage
- Identify slow endpoints and performance bottlenecks
- Interactive status trend charts
- Live system monitoring

#### Logs Page (`/logs`)

- Browse all API requests with modern, responsive interface
- Filter logs by:
  - Endpoint (with debounced search - 500ms delay)
  - Date and time
  - Status code
- View paginated results with color-coded status indicators
- Smart search functionality that waits for user to stop typing
- Visual feedback during search operations

#### Log Details (`/logs/:id`)

- View complete request details
- Inspect request and response bodies
- Check headers and session logs
- Copy data for debugging

#### Settings (`/logs/settings`)

- Manage your account and user preferences
- **Admin Features** (admin users only):
  - Add new users with automatic developer role assignment
  - Remove existing users (except self)
  - View all registered users
- Secure logout functionality
- Modern, responsive settings interface

## Configuration Options

The `createExpressLogger` function accepts the following parameters:

- `app`: Your Express application instance (use `app as any` for TypeScript)
- `mongoUri`: MongoDB connection string (e.g., `mongodb://localhost:27017/your-database`)
- `beginswith`: Array of path prefixes to log (optional, e.g., `['/api']`)
- `specifics`: Array of paths to exclude from logging (optional, e.g., `['/auth']`)

### Environment Variables

For production deployments, consider using environment variables:

```javascript
createExpressLogger({
	app: app as any,
	mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/your-database',
	beginswith: process.env.LOG_PREFIXES ? process.env.LOG_PREFIXES.split(',') : ['/api'],
	specifics: process.env.LOG_EXCLUDE ? process.env.LOG_EXCLUDE.split(',') : ['/auth'],
});
```

## Performance Features

- **Database Indexes**: Automatically created for optimal query performance
- **Query Optimization**: Optimized aggregation queries with proper indexing
- **Asynchronous Logging**: Non-blocking log storage
- **Connection Pooling**: Optimized MongoDB connections
- **Field Projection**: Reduced data transfer for better performance
- **Debounced Search**: Smart search with 500ms delay to reduce server load
- **Efficient Pagination**: Optimized data loading with proper limits

## Modern UI Components

The dashboard features a modern, professional interface built with:

- **Tailwind CSS**: Utility-first CSS framework for consistent styling
- **Chart.js**: Interactive charts for data visualization
- **Responsive Design**: Mobile-first approach with adaptive layouts
- **Dark Theme**: Professional dark interface with proper contrast
- **Loading States**: Visual feedback during data operations
- **Error Handling**: Graceful error display with clear messaging
- **Copy Functionality**: One-click copying of JSON data
- **Color Coding**: Visual status indicators for different HTTP status codes

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

### Performance Issues

If you're experiencing slow loading times:

1. **Check Indexes**: Ensure database indexes are created automatically
2. **Monitor Memory**: Check server memory usage
3. **Database Connection**: Verify MongoDB connection pooling
4. **Query Optimization**: The system includes optimized queries for better performance

## Security

- All dashboard routes are protected by JWT authentication
- First-time login creates an admin account
- Subsequent logins create dev accounts
- Session tokens expire after 1 hour
- Secure cookie-based authentication
- Role-based access control for user management
- Admin-only user creation and removal features
- Protected API endpoints with proper authorization

## User Management

The system includes comprehensive user management features:

### Admin Features

- **Add Users**: Create new user accounts with automatic developer role assignment
- **Remove Users**: Delete user accounts (admins cannot remove themselves)
- **View Users**: See all registered users in the system
- **Role Management**: Automatic role assignment based on login order

### User Roles

- **Admin**: Full access to all features including user management
- **Developer**: Standard access to dashboard, logs, and settings (no user management)

### First-Time Setup

1. Navigate to `/logs/login`
2. First user to log in automatically becomes an admin
3. Subsequent users are assigned developer role
4. Admins can then add additional users through the settings page

## Recent Updates

### Version 2.0.0 Features

- ✅ **Modern Dark UI**: Complete redesign with professional dark theme
- ✅ **User Management**: Admin controls for adding/removing users
- ✅ **Debounced Search**: Smart search with 500ms delay for better performance
- ✅ **Time Range Filters**: Customizable dashboard metrics (1h, 24h, 7d, 30d)
- ✅ **Color-coded Logs**: Visual status indicators for different HTTP status codes
- ✅ **Responsive Design**: Mobile-first approach with adaptive layouts
- ✅ **Enhanced Error Handling**: Graceful error display with clear messaging
- ✅ **Copy Functionality**: One-click copying of JSON data
- ✅ **Loading States**: Visual feedback during data operations

## Roadmap

- [ ] Add support for NestJS applications
- [ ] Add support for other Node.js frameworks
- [ ] Implement real-time WebSocket updates
- [ ] Add custom alert configurations
- [ ] Support for multiple database types
- [ ] Export functionality for logs and reports
- [ ] Advanced filtering and search capabilities
- [ ] API rate limiting and monitoring

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
