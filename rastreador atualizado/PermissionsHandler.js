import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

class PermissionsHandler {
  // Request foreground location permissions with friendly messages
  async requestForegroundPermissions() {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    
    if (status === 'granted') {
      return status;
    }
    
    if (!canAskAgain) {
      this.showPermissionInstructions('foreground');
      throw new Error('Location permission permanently denied. Please enable in Settings.');
    }
    
    throw new Error('Location permission is required for tracking');
  }

  // Request background location permissions with friendly messages
  async requestBackgroundPermissions() {
    const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
    
    if (status === 'granted') {
      return status;
    }
    
    if (!canAskAgain) {
      this.showPermissionInstructions('background');
      throw new Error('Background location permission permanently denied');
    }
    
    throw new Error('Background location permission is required for tracking');
  }

  // Show instructions to enable permissions in Settings
  showPermissionInstructions(type) {
    const message = type === 'foreground' 
      ? 'O app precisa da localização para rastrear o veículo.\n\nVá em Configurações > Privacidade > Localização e permita o acesso.'
      : 'O app precisa de localização em segundo plano para continuar rastreando quando fechado.\n\nVá em Configurações > Privacidade > Localização > Sempre.';
    
    Alert.alert(
      'Permissão Necessária',
      message,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Abrir Configurações', 
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }
        },
      ]
    );
  }

  // Request all location permissions
  async requestAllPermissions() {
    await this.requestForegroundPermissions();
    await this.requestBackgroundPermissions();
  }

  // Check if foreground permissions are granted
  async checkForegroundPermissions() {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  }

  // Check if background permissions are granted
  async checkBackgroundPermissions() {
    const { status } = await Location.getBackgroundPermissionsAsync();
    return status === 'granted';
  }

  // Check all permissions at once
  async checkAllPermissions() {
    const foreground = await this.checkForegroundPermissions();
    const background = await this.checkBackgroundPermissions();
    return { foreground, background };
  }
}

export default PermissionsHandler;
