# emaestro-core

The core backend functionality for the emaestro project. This package provides the controllers for the API service, sync service, and scheduled tasks services, as well as types used for the services. 

This package is meant to provide the backend services for the project independent of what cloud provider the application is hosted on, whether it's on AWS Lambda, GCP cloud functions, Azure functions, or as a server on an instance. Use whatever controller is necessary from the project, and, as long as it's routed properly (look at this [package](https://github.com/cloudydaiyz/emaestro/packages/emaestro-gcp) for example), it should be working properly.

This package uses MongoDB as its database provider. In order for services to properly run in production, you must have a MongoDB (or MongoDB Atlas) instance up and running.

Before running this package, ensure that you have all necessary environment variables set. Look at `src/util/env.ts` from [this package's repository](https://github.com/cloudydaiyz/emaestro/packages/emaestro-core) for more details.