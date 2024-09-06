# Node API Logs

Node API Logs is a library that allows Express.js developers to view logs on their server without the need for any third-party services or payments. The library currently only supports Express.js and requires a MongoDB URI.

## Features

- View server logs in a user-friendly interface
- Secure login system for accessing logs
- Simple user management (password reset and user addition through MongoDB)
- Easy integration with existing Express.js applications

## Installation

You can install the library using npm or yarn:

```bash
npm i node-api-logs
# or
yarn add node-api-logs
```

To use the library, you need to import the 

```bash 
createApp

import {createApp} from "node-api-logs";

createApp(app,"mongo uri");
```
function and provide your Express app instance along with a MongoDB URI. 

 Here’s a basic example of how to use the library in your index.ts file:

 ```bash
 import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import expressFileUpload from 'express-fileupload';
import path from 'path';
import { createApp } from "node-api-logs";

// Configurations
dotenv.config();
import './config/database';
import './config/redis';
import AppRoutes from './modules/app/app.route';
import { formatReq } from './middlewares/helpers.middleware';
import logger from './config/logger';
import morganMiddleware from './middlewares/morgan.middleware';

// Boot express
const app: Application = express();
const port = process.env.PORT || 3000;
const base: string = process.env.base_url ?? '/staging/api/v1';

// Middlewares
app.use(cors());
app.use(helmet());
app.use(expressFileUpload({ createParentPath: true, useTempFiles: true }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use('/docs', express.static(path.join(__dirname, 'docs')));
app.use(formatReq);
app.use(morganMiddleware);

// Set up Node API Logs
createApp(app, "your-mongodb-uri");

// Application routing
app.get('/', (req: Request, res: Response) => {
    res.status(200).send({ data: 'BACKEND Application' });
});
app.use(base, AppRoutes);

// Start server
app.listen(port, () => logger.info(`Server is listening on port ${port}!`));

// Handle unhandled promise rejections and exceptions
process.on('unhandledRejection', (err: any) => {
    logger.error('Unhandled Rejection', err);
});

process.on('uncaughtException', (err: any) => {
    logger.error(err.message, err);
});
```

To access the logs, visit:

```bash
http://localhost:PORT/logs/login
```
### User Management

To change a user's password:

1. Go to [bcrypt-generator](https://bcrypt-generator.com) to generate a new password.
2. Manually update the user's password in the MongoDB database.

To add a new user:

1. Go to your `users` collection in MongoDB.
2. Click on "Add Data" and select "Insert Document."
3. Click "Insert" and then edit the new document to add the user's email.
4. Once the user visits `http://localhost:PORT/logs/login` and inputs their email and password, the password will be automatically set for them.

To remove a user:

Simply delete the user's record from the database.

### Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature-branch`).
3. Make your changes.
4. Commit your changes (`git commit -m 'Add feature'`).
5. Push to the branch (`git push origin feature-branch`).
6. Open a pull request.

Please make sure to update tests as appropriate.

### Contact

For issues or questions, feel free to contact me at:

- Email: [paulambrose5002@gmail.com](mailto:paulambrose5002@gmail.com)
- GitHub: [Ugochukwudev](https://github.com/ugochukwudev)

### License

This project is licensed under the MIT License. See the `LICENSE` file for details.
