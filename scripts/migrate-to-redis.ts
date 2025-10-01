import { connectRedis } from '../lib/redis';
import fs from 'fs';
import path from 'path';

async function migrateDataToRedis() {
  try {
    console.log('Starting migration from data.json to Redis...');
    
    // Connect to Redis
    const redis = await connectRedis();
    
    // Read existing data.json file
    const dataFile = path.join(process.cwd(), 'data', 'portfolio.json');
    
    if (!fs.existsSync(dataFile)) {
      console.log('No data.json file found, skipping migration.');
      return;
    }
    
    const fileData = fs.readFileSync(dataFile, 'utf8');
    const portfolioData = JSON.parse(fileData);
    
    console.log(`Found ${portfolioData.length} portfolio items to migrate`);
    
    // Store in Redis
    await redis.set('portfolio:data', JSON.stringify(portfolioData));
    
    console.log('✅ Migration completed successfully!');
    console.log('Data is now stored in Redis under key: portfolio:data');
    
    // Verify the data was stored correctly
    const storedData = await redis.get('portfolio:data');
    const verifyData = JSON.parse(storedData || '[]');
    
    console.log(`✅ Verification: ${verifyData.length} items stored in Redis`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    process.exit(0);
  }
}

migrateDataToRedis();