import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import ApiService from './ApiService';
import PermissionsHandler from './PermissionsHandler';

const LOCATION_TASK_NAME = 'background-location-task';

class LocationTracker {
  constructor() {
    this.isTracking = false;
    this.driverId = 'driver-123'; // Mock driver ID - replace with actual
  }

  // Start foreground location tracking
  async startForegroundTracking() {
    try {
      await PermissionsHandler.requestForegroundPermissions();

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Send to server
      await this.sendLocationToServer(location);

      console.log('Foreground location tracked');
      return location;
    } catch (error) {
      console.error('Error in foreground tracking:', error);
      throw error;
    }
  }

  // Start background location tracking
  async startBackgroundTracking() {
    try {
      await PermissionsHandler.requestAllPermissions();

      // Define the background task
      TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
        if (error) {
          console.error('Location task error:', error);
          return;
        }
        if (data) {
          const { locations } = data;
          const location = locations[0];
          if (location) {
            await this.sendLocationToServer(location);
          }
        }
      });

      // Start location updates
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000, // Update every 5 seconds
        distanceInterval: 10, // Or when moved 10 meters
        showsBackgroundLocationIndicator: true,
      });

      this.isTracking = true;
      console.log('Background location tracking started');
    } catch (error) {
      console.error('Error starting background tracking:', error);
      throw error;
    }
  }

  // Stop background location tracking
  async stopBackgroundTracking() {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      this.isTracking = false;
      console.log('Background location tracking stopped');
    } catch (error) {
      console.error('Error stopping background tracking:', error);
      throw error;
    }
  }

  // Send location to server
  async sendLocationToServer(location) {
    try {
      const locationData = {
        driverId: this.driverId,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        accuracy: location.coords.accuracy,
      };

      await ApiService.sendLocation(locationData);
      console.log('Location sent to server:', locationData);
    } catch (error) {
      console.error('Error sending location to server:', error);
    }
  }

  // Get current location
  async getCurrentLocation() {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return location;
    } catch (error) {
      console.error('Error getting current location:', error);
      throw error;
    }
  }
}

export default new LocationTracker();
