const { createClient } = require('redis');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

async function migrateDataToRedis() {
  let client;
  
  try {
    console.log('Starting migration from data.json to Redis...');
    console.log('Redis URL:', process.env.REDIS_URL ? 'Found' : 'Missing');
    
    // Connect to Redis
    client = createClient({
      url: process.env.REDIS_URL
    });
    
    await client.connect();
    console.log('✅ Connected to Redis');
    
    // Read existing data.json file
    const dataFile = path.join(process.cwd(), 'data', 'portfolio.json');
    
    if (!fs.existsSync(dataFile)) {
      console.log('No portfolio.json file found, skipping migration.');
      return;
    }
    
    const fileData = fs.readFileSync(dataFile, 'utf8');
    const portfolioData = JSON.parse(fileData);
    
    console.log(`Found ${portfolioData.length} portfolio items to migrate`);
    
    // Store in Redis
    await client.set('portfolio:data', JSON.stringify(portfolioData));
    
    console.log('✅ Migration completed successfully!');
    console.log('Data is now stored in Redis under key: portfolio:data');
    
    // Verify the data was stored correctly
    const storedData = await client.get('portfolio:data');
    const verifyData = JSON.parse(storedData || '[]');
    
    console.log(`✅ Verification: ${verifyData.length} items stored in Redis`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
    process.exit(0);
  }
}

migrateDataToRedis();