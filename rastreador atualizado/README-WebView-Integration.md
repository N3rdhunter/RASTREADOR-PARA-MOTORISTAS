 # Integração WebView - Extensão de Rastreamento de Motorista de Táxi

## 📱 Visão Geral

Esta versão da extensão foi otimizada para integração em apps nativos Android/iOS através de WebView. A extensão mantém todas as funcionalidades originais mas adiciona comunicação bidirecional com o app nativo.

## 🚀 Funcionalidades

### ✅ Funcionalidades Mantidas
- Rastreamento GPS em tempo real
- Cálculo de velocidade com alertas
- Salvamento de rotas no IndexedDB
- Interface responsiva otimizada para mobile
- Mapa Leaflet interativo

### 🆕 Funcionalidades Adicionadas
- **WebView Bridge**: Comunicação bidirecional com app nativo
- **Controle Nativo**: App pode controlar funções da extensão
- **Notificações Nativas**: Alertas enviados para o app nativo
- **Otimização WebView**: Interface otimizada para WebView

## 🔧 Integração Técnica

### Android WebView Setup

```java
// MainActivity.java
public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings webSettings = webView.getSettings();

        // Enable JavaScript
        webSettings.setJavaScriptEnabled(true);

        // Enable geolocation
        webSettings.setGeolocationEnabled(true);

        // Enable DOM storage
        webSettings.setDomStorageEnabled(true);

        // WebView optimizations
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // Add JavaScript interface
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidBridge");

        // Load the HTML file
        webView.loadUrl("file:///android_asset/android-integration.html");

        // Handle WebView client
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                // WebView is ready
            }
        });
    }

    // JavaScript Interface
    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void postMessage(String message) {
            // Handle messages from WebView
            try {
                JSONObject json = new JSONObject(message);
                String type = json.getString("type");

                switch (type) {
                    case "webview_ready":
                        // WebView is loaded and ready
                        break;
                    case "location_update":
                        // Handle location updates
                        JSONObject location = json.getJSONObject("location");
                        double lat = location.getDouble("lat");
                        double lng = location.getDouble("lng");
                        // Process location data
                        break;
                    case "speed_warning":
                        // Handle speed warnings
                        double speed = json.getDouble("speed");
                        showSpeedWarning(speed);
                        break;
                    case "route_saved":
                        // Handle route saved
                        showToast("Rota salva com sucesso!");
                        break;
                }
            } catch (JSONException e) {
                e.printStackTrace();
            }
        }

        private void showSpeedWarning(double speed) {
            // Show native notification or alert
            Toast.makeText(mContext, "Velocidade alta: " + speed + " km/h", Toast.LENGTH_LONG).show();
        }

        private void showToast(String message) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show();
        }
    }

    // Send messages to WebView
    private void sendToWebView(String type, JSONObject data) {
        try {
            JSONObject message = new JSONObject();
            message.put("type", type);
            if (data != null) {
                // Add additional data
                Iterator<String> keys = data.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    message.put(key, data.get(key));
                }
            }

            final String js = "javascript:if(window.receiveFromNative) window.receiveFromNative(" + message.toString() + ")";

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript(js, null);
                }
            });
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }

    // Example: Start ride from native button
    public void startRideFromNative() {
        sendToWebView("start_ride", null);
    }

    // Example: Set driver name from native app
    public void setDriverName(String name) {
        try {
            JSONObject data = new JSONObject();
            data.put("name", name);
            sendToWebView("set_driver_name", data);
        } catch (JSONException e) {
            e.printStackTrace();
        }
    }
}
```

### iOS WKWebView Setup

```swift
// ViewController.swift
import UIKit
import WebKit

class ViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        // Configure WKWebView
        let config = WKWebViewConfiguration()

        // Add script message handler
        config.userContentController.add(self, name: "bridge")

        webView = WKWebView(frame: view.bounds, configuration: config)
        view.addSubview(webView)

        // Load HTML file
        if let htmlPath = Bundle.main.path(forResource: "android-integration", ofType: "html") {
            let htmlUrl = URL(fileURLWithPath: htmlPath)
            webView.loadFileURL(htmlUrl, allowingReadAccessTo: htmlUrl)
        }

        // Enable location services
        webView.configuration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
    }

    // Handle messages from WebView
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "bridge", let messageBody = message.body as? [String: Any] {
            handleWebViewMessage(messageBody)
        }
    }

    func handleWebViewMessage(_ message: [String: Any]) {
        guard let type = message["type"] as? String else { return }

        switch type {
        case "webview_ready":
            print("WebView is ready")
        case "location_update":
            if let location = message["location"] as? [String: Any],
               let lat = location["lat"] as? Double,
               let lng = location["lng"] as? Double {
                print("Location update: \(lat), \(lng)")
                // Process location data
            }
        case "speed_warning":
            if let speed = message["speed"] as? Double {
                showSpeedWarning(speed: speed)
            }
        case "route_saved":
            showAlert(title: "Sucesso", message: "Rota salva com sucesso!")
        default:
            break
        }
    }

    // Send messages to WebView
    func sendToWebView(type: String, data: [String: Any]? = nil) {
        var message: [String: Any] = ["type": type]
        if let data = data {
            message.merge(data) { (_, new) in new }
        }

        if let jsonData = try? JSONSerialization.data(withJSONObject: message),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            let js = "if(window.receiveFromNative) window.receiveFromNative(\(jsonString))"
            webView.evaluateJavaScript(js)
        }
    }

    // Example methods
    func startRideFromNative() {
        sendToWebView(type: "start_ride")
    }

    func setDriverName(_ name: String) {
        sendToWebView(type: "set_driver_name", data: ["name": name])
    }

    func showSpeedWarning(speed: Double) {
        let alert = UIAlertController(title: "Alerta de Velocidade",
                                    message: "Velocidade atual: \(speed) km/h",
                                    preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    func showAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}
```

## 📋 Mensagens WebView

### De WebView para Nativo

| Tipo | Descrição | Dados |
|------|-----------|-------|
| `webview_ready` | WebView carregado e pronto | - |
| `location_update` | Atualização de localização | `{location: {lat, lng, timestamp, accuracy}}` |
| `speed_warning` | Alerta de velocidade alta | `{speed, limit}` |
| `ride_started` | Corrida iniciada | - |
| `ride_start_error` | Erro ao iniciar corrida | `{error}` |
| `route_saved` | Rota salva com sucesso | `{route}` |
| `route_save_error` | Erro ao salvar rota | `{error}` |
| `route_displayed` | Rota exibida no mapa | `{routeId}` |
| `routes_load_error` | Erro ao carregar rotas | `{error}` |
| `tracking_error` | Erro no rastreamento | `{error}` |
| `location_obtained` | Localização obtida | `{location: {lat, lng}}` |
| `location_error` | Erro ao obter localização | `{error}` |
| `driver_name_updated` | Nome do motorista atualizado | `{name}` |

### De Nativo para WebView

| Tipo | Descrição | Dados |
|------|-----------|-------|
| `set_driver_name` | Define nome do motorista | `{name}` |
| `start_ride` | Inicia corrida | - |
| `stop_tracking` | Para rastreamento | - |
| `get_location` | Obtém localização atual | - |
| `show_routes` | Mostra rotas salvas | - |

## 🎯 Como Usar

1. **Adicione o arquivo `android-integration.html`** ao seu projeto nativo
2. **Configure o WebView** conforme os exemplos acima
3. **Implemente os handlers** para as mensagens do WebView
4. **Controle a extensão** através das mensagens nativas

## 🔒 Permissões Necessárias

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
```

### iOS (Info.plist)
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Esta app precisa de acesso à localização para rastrear corridas de táxi.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Esta app precisa de acesso contínuo à localização para rastreamento em tempo real.</string>
```

## 🚀 Próximos Passos

1. **Teste a integração** em dispositivos reais
2. **Personalize a UI** conforme o design do seu app
3. **Adicione funcionalidades nativas** como notificações push
4. **Implemente sincronização** com servidor backend
5. **Otimize performance** para diferentes dispositivos

## 📞 Suporte

Para dúvidas sobre integração, consulte:
- Documentação WebView Android: https://developer.android.com/guide/webapps/webview
- Documentação WKWebView iOS: https://developer.apple.com/documentation/webkit/wkwebview

---

**A extensão está pronta para integração em apps nativos! 🚕📱**
