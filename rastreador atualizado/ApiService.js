import axios from 'axios';
import CacheService from './services/CacheService';
import NetworkService from './services/NetworkService';

// Mock server URL - replace with actual server URL
const API_BASE_URL = 'https://mock-server.example.com/api';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    this.maxRetries = 3;
    this.baseDelay = 1000;
  }

  // Send location data to server with retry and cache
  async sendLocation(locationData) {
    const sendFn = async () => {
      const response = await this.client.post('/location', locationData);
      return response.data;
    };

    try {
      return await NetworkService.executeWithRetry(
        sendFn,
        this.maxRetries,
        this.baseDelay
      );
    } catch (error) {
      // Network failed - cache locally
      console.log('Network failed, caching location locally');
      await CacheService.saveLocation(locationData);
      throw error;
    }
  }

  // Send all cached locations
  async sendCachedLocations() {
    const isConnected = await NetworkService.checkConnection();
    if (!isConnected) {
      console.log('No network connection, cannot send cached locations');
      return { sent: 0, remaining: await CacheService.getLocationsCount() };
    }

    return await CacheService.sendCachedLocations(this);
  }

  // Get driver status
  async getDriverStatus(driverId) {
    try {
      const response = await this.client.get(`/driver/${driverId}/status`);
      return response.data;
    } catch (error) {
      console.error('Error getting driver status:', error);
      throw error;
    }
  }

  // Update driver status
  async updateDriverStatus(driverId, status) {
    try {
      const response = await this.client.put(`/driver/${driverId}/status`, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating driver status:', error);
      throw error;
    }
  }
}

export default new ApiService();
