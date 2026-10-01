// MongoDB initialization script for Smart House
// This script runs when the container is first created

// Switch to the smarthouse database
db = db.getSiblingDB('smarthouse');

// Create a user for the application
db.createUser({
  user: 'sh-user',
  pwd: 'smarthouse',
  roles: [
    {
      role: 'readWrite',
      db: 'smarthouse'
    }
  ]
});

// Create initial collections with schema validation (optional)
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'createdAt'],
      properties: {
        email: {
          bsonType: 'string',
          description: 'must be a string and is required'
        },
        name: {
          bsonType: 'string',
          description: 'must be a string'
        },
        createdAt: {
          bsonType: 'date',
          description: 'must be a date and is required'
        }
      }
    }
  }
});

db.createCollection('devices');

// Create indexes for better query performance
db.users.createIndex({ email: 1 }, { unique: true });
db.devices.createIndex({ name: 1 });
db.devices.createIndex({ type: 1 });
db.devices.createIndex({ status: 1 });

print('Smart House database initialized successfully!');
