import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import ApiService from './ApiService';
import NetworkService from './services/NetworkService';
import CacheService from './services/CacheService';

const LOCATION_TASK_NAME = 'background-location-task';

class LocationService {
  constructor() {
    this.isTracking = false;
    this.driverId = 'driver-123'; // Mock driver ID - replace with actual
    this.speedLimit = 60; // km/h - limite padrão
    this.lastPosition = null;
    this.lastSpeed = 0;
    this.speedWarningShown = false;
    this.locationHistory = []; // Armazenar histórico de localizações
    this.maxHistorySize = 50;
    this.batteryLevel = 100;
    this.powerSaveMode = false;
  }

  // Request location permissions
  async requestPermissions() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      throw new Error('Background location permission not granted');
    }
  }

  // Check battery and adjust tracking frequency
  async checkBatteryAndAdjust() {
    try {
      this.batteryLevel = await Battery.getBatteryLevelAsync();
      const powerSaveMode = await Battery.isLowPowerModeEnabledAsync();
      this.powerSaveMode = powerSaveMode;

      // Ajustar frequency based na bateria
      if (this.batteryLevel < 20 || this.powerSaveMode) {
        // Modo economia - atualizar menos frequente
        return {
          timeInterval: 15000, // 15 segundos
          distanceInterval: 20, // 20 metros
        };
      } else if (this.batteryLevel < 50) {
        // Moderado
        return {
          timeInterval: 10000, // 10 segundos
          distanceInterval: 15,
        };
      }
      // Normal
      return {
        timeInterval: 5000, // 5 segundos
        distanceInterval: 10,
      };
    } catch (error) {
      console.error('Error checking battery:', error);
      // Default
      return {
        timeInterval: 5000,
        distanceInterval: 10,
      };
    }
  }

  // Start background location tracking
  async startTracking() {
    try {
      await this.requestPermissions();

      // Check battery and get optimal settings
      const batterySettings = await this.checkBatteryAndAdjust();

      // Reset speed tracking variables
      this.lastPosition = null;
      this.lastSpeed = 0;
      this.speedWarningShown = false;
      this.locationHistory = [];

      // Try to send cached locations first
      await this.syncCachedLocations();

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
            this.checkSpeedLimit(location);
            this.addToHistory(location);
          }
        }
      });

      // Start location updates with battery-optimized settings
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        timeInterval: batterySettings.timeInterval,
        distanceInterval: batterySettings.distanceInterval,
        showsBackgroundLocationIndicator: true,
        deferredUpdatesInterval: batterySettings.timeInterval,
      });

      this.isTracking = true;
      console.log('Location tracking started with battery optimization');
    } catch (error) {
      console.error('Error starting tracking:', error);
      throw error;
    }
  }

  // Stop background location tracking
  async stopTracking() {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      this.isTracking = false;
      console.log('Location tracking stopped');
    } catch (error) {
      console.error('Error stopping tracking:', error);
      throw error;
    }
  }

  // Sync cached locations when back online
  async syncCachedLocations() {
    try {
      const result = await ApiService.sendCachedLocations();
      if (result.sent > 0) {
        console.log(`Synced ${result.sent} cached locations`);
      }
    } catch (error) {
      console.error('Error syncing cached locations:', error);
    }
  }

  // Send location to server with offline support
  async sendLocationToServer(location) {
    const locationData = {
      driverId: this.driverId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date().toISOString(),
      accuracy: location.coords.accuracy,
      speed: this.lastSpeed,
      batteryLevel: this.batteryLevel,
    };

    try {
      await ApiService.sendLocation(locationData);
      console.log('Location sent to server');
    } catch (error) {
      console.log('Failed to send location, saved to cache');
      // Location is already cached in ApiService
    }
  }

  // Add location to history
  addToHistory(location) {
    this.locationHistory.unshift({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: location.timestamp || new Date().getTime(),
      speed: this.lastSpeed,
    });

    // Limit history size
    if (this.locationHistory.length > this.maxHistorySize) {
      this.locationHistory.pop();
    }
  }

  // Get location history
  getLocationHistory() {
    return this.locationHistory;
  }

  // Calculate speed limit and show warnings
  checkSpeedLimit(location) {
    if (!this.lastPosition) {
      this.lastPosition = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: location.timestamp || new Date().getTime()
      };
      return;
    }

    const currentTime = location.timestamp || new Date().getTime();
    const timeDiff = (currentTime - this.lastPosition.timestamp) / 1000; // segundos

    if (timeDiff > 0) {
      // Calculate distance using Haversine formula
      const R = 6371; // Earth's radius in km
      const dLat = (location.coords.latitude - this.lastPosition.latitude) * Math.PI / 180;
      const dLon = (location.coords.longitude - this.lastPosition.longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.lastPosition.latitude * Math.PI / 180) * Math.cos(location.coords.latitude * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c; // km

      // Calculate speed in km/h
      const speed = (distance / timeDiff) * 3600;
      this.lastSpeed = speed;

      console.log(`Velocidade atual: ${speed.toFixed(1)} km/h`);

      // Check speed limit
      if (speed > this.speedLimit && !this.speedWarningShown) {
        this.showSpeedWarning(speed);
        this.speedWarningShown = true;
      } else if (speed <= this.speedLimit && this.speedWarningShown) {
        this.speedWarningShown = false;
        console.log('Velocidade normalizada');
      }
    }

    // Update last position
    this.lastPosition = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: currentTime
    };
  }

  // Show speed warning (requires React Native Alert)
  showSpeedWarning(speed) {
    console.warn(`ALERTA: Velocidade ${speed.toFixed(1)} km/h excedeu limite de ${this.speedLimit} km/h`);
    // Note: Alert.alert requires UI context - will be called from App.js
  }

  // Set speed limit
  setSpeedLimit(limit) {
    this.speedLimit = limit;
    console.log(`Novo limite de velocidade: ${limit} km/h`);
  }

  // Get current location (for foreground use)
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

  // Get current speed
  getCurrentSpeed() {
    return this.lastSpeed;
  }

  // Get battery level
  getBatteryLevel() {
    return this.batteryLevel;
  }

  // Check if speed warning is active
  isSpeedWarningActive() {
    return this.speedWarningShown;
  }

  // Get tracking status
  getStatus() {
    return {
      isTracking: this.isTracking,
      speed: this.lastSpeed,
      speedLimit: this.speedLimit,
      speedWarning: this.speedWarningShown,
      batteryLevel: this.batteryLevel,
      powerSaveMode: this.powerSaveMode,
      historySize: this.locationHistory.length,
    };
  }
}

export default new LocationService();
