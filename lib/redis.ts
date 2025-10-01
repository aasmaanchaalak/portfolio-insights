import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL
});

client.on('error', (err) => console.log('Redis Client Error', err));

let isConnected = false;

const connectRedis = async () => {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
  return client;
};

export { connectRedis };
export default client;