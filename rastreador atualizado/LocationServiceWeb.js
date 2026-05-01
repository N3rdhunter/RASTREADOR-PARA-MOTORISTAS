class LocationServiceWeb {
    static isTracking = false;
    static watchId = null;

    static async startTracking() {
        if (this.isTracking) {
            throw new Error('Tracking is already active');
        }

        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by this browser');
        }

        return new Promise((resolve, reject) => {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    console.log('Location update:', position.coords);
                    // In a real app, you would send this to a server
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    reject(new Error('Failed to get location: ' + error.message));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
            this.isTracking = true;
            resolve();
        });
    }

    static async stopTracking() {
        if (!this.isTracking) {
            throw new Error('Tracking is not active');
        }

        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.isTracking = false;
    }

    static async getCurrentLocation() {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by this browser');
        }

        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve(position);
                },
                (error) => {
                    reject(new Error('Failed to get current location: ' + error.message));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
}

export default LocationServiceWeb;
