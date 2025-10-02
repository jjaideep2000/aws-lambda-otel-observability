// Example: API Gateway Handler with Zero Observability Code
// Developer only writes business logic!

import { APIHandler } from '@company/lambda-observability';

const apiHandler = new APIHandler('user-service');

export const handler = async (event, context) => {
    return await apiHandler.handle(event, context, async (event, { logger, traceContext }) => {
        // PURE BUSINESS LOGIC ONLY - No observability code needed!
        
        const { httpMethod, pathParameters, body } = event;
        
        switch (httpMethod) {
            case 'GET':
                return await getUser(pathParameters.userId, logger);
                
            case 'POST':
                return await createUser(JSON.parse(body), logger);
                
            case 'PUT':
                return await updateUser(pathParameters.userId, JSON.parse(body), logger);
                
            default:
                return {
                    statusCode: 405,
                    body: JSON.stringify({ error: 'Method not allowed' })
                };
        }
    });
};

// Pure business functions
async function getUser(userId, logger) {
    logger.addBusinessContext({ userId, operation: 'get_user' });
    
    // Simulate database lookup
    const user = {
        id: userId,
        name: 'John Doe',
        email: 'john@example.com'
    };
    
    return {
        statusCode: 200,
        body: JSON.stringify(user)
    };
}

async function createUser(userData, logger) {
    logger.addBusinessContext({ 
        operation: 'create_user',
        userEmail: userData.email 
    });
    
    // Validate user data
    if (!userData.email || !userData.name) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Email and name are required' })
        };
    }
    
    // Simulate user creation
    const newUser = {
        id: Math.random().toString(36).slice(2),
        ...userData,
        createdAt: new Date().toISOString()
    };
    
    return {
        statusCode: 201,
        body: JSON.stringify(newUser)
    };
}

async function updateUser(userId, userData, logger) {
    logger.addBusinessContext({ 
        userId, 
        operation: 'update_user' 
    });
    
    // Simulate user update
    const updatedUser = {
        id: userId,
        ...userData,
        updatedAt: new Date().toISOString()
    };
    
    return {
        statusCode: 200,
        body: JSON.stringify(updatedUser)
    };
}