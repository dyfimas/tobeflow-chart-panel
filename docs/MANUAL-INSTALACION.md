# ToBeFlow Chart Panel — Manual de Instalación

**Versión:** 1.3.0  
**Plugin ID:** `tobeflow-chart-panel`  
**Compatibilidad:** Grafana ≥ 10.0.0

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Compilar el plugin](#2-compilar-el-plugin)
3. [Instalación en Docker](#3-instalación-en-docker)
4. [Instalación local (sin Docker)](#4-instalación-local-sin-docker)
5. [Instalación en Kubernetes](#5-instalación-en-kubernetes)
6. [Verificación](#6-verificación)
7. [Actualización](#7-actualización)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Requisitos previos

### Para compilar

| Herramienta | Versión mínima |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

### Para desplegar

| Herramienta | Versión mínima |
|---|---|
| Grafana | 10.0.0+ (recomendado: 11.4.0) |
| Docker (si aplica) | 20.10+ |
| Docker Compose (si aplica) | 2.0+ |
| kubectl + Helm (si aplica) | 1.25+ / 3.0+ |

---

## 2. Compilar el plugin

### Clonar / obtener el código fuente

```bash
# Si tienes el código en un repositorio
git clone <repo-url> svg-flow-panel
cd svg-flow-panel
```

### Instalar dependencias

```bash
npm install
```

### Build de producción

```bash
npm run build
```

Esto genera el directorio `dist/` con:
```
dist/
├── module.js       # Bundle principal (~1.5 MB)
├── module.js.map   # Source map
├── plugin.json     # Metadatos del plugin
└── img/
    └── logo.svg    # Logo del plugin
```

### Build de desarrollo (con hot-reload)

```bash
npm run dev
```

Genera el bundle en modo development con source maps completos y LiveReload. Cada cambio en el código recompila automáticamente.

---

## 3. Instalación en Docker

### 3.1 Docker Compose — Producción

Crea un directorio para tu proyecto y coloca el `dist/` compilado:

```
grafana-prod/
├── docker-compose.yml
├── plugins/
│   └── svg-flow-panel/
│       └── dist/
│           ├── module.js
│           ├── plugin.json
│           └── img/
└── provisioning/        # (opcional)
    └── datasources/
```

**docker-compose.yml:**

```yaml
version: "3.8"

services:
  grafana:
    image: grafana/grafana:11.4.0
    container_name: grafana-prod
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # ── Credenciales (cambiar en producción) ──
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: "${GF_ADMIN_PASSWORD:-admin}"
      # ── Server ──
      GF_SERVER_DOMAIN: grafana.ejemplo.com
      GF_SERVER_ROOT_URL: https://grafana.ejemplo.com/
      # ── Plugin sin firma ──
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: "tobeflow-chart-panel"
      # ── Modo producción ──
      GF_DEFAULT_APP_MODE: production
      GF_LOG_LEVEL: info
    volumes:
      # Plugin compilado (read-only en producción)
      - ./plugins/svg-flow-panel/dist:/var/lib/grafana/plugins/tobeflow-chart-panel:ro
      # Datos persistentes
      - grafana-data:/var/lib/grafana
      # Provisioning (opcional)
      - ./provisioning:/etc/grafana/provisioning
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

volumes:
  grafana-data:
```

**Desplegar:**

```bash
docker compose up -d
```

> **Nota de seguridad**: En producción, usa variables de entorno o Docker secrets para las credenciales. No dejes `admin/admin` como password.

### 3.2 Docker Compose — Desarrollo

Para desarrollo con hot-reload del plugin:

```yaml
version: "3.8"

services:
  grafana:
    image: grafana/grafana:11.4.0
    container_name: grafana-dev
    restart: unless-stopped
    ports:
      - "3034:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: "tobeflow-chart-panel"
      GF_DEFAULT_APP_MODE: development
      GF_LOG_LEVEL: debug
      GF_FEATURE_TOGGLES_ENABLE: "publicDashboards"
    volumes:
      # Plugin en desarrollo (read-write para hot-reload)
      - ./plugins/svg-flow-panel/dist:/var/lib/grafana/plugins/tobeflow-chart-panel
      - grafana-dev-data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"

volumes:
  grafana-dev-data:
```

**Flujo de desarrollo:**

```bash
# Terminal 1: Grafana
docker compose up -d

# Terminal 2: Build con hot-reload
cd plugins/svg-flow-panel
npm run dev
```

Cada cambio en el código se recompila y el LiveReload recarga el panel en el navegador automáticamente.

### 3.3 Solo Docker (sin Compose)

```bash
# Crear volumen para datos
docker volume create grafana-data

# Ejecutar
docker run -d \
  --name grafana \
  -p 3000:3000 \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=tobeflow-chart-panel \
  -v /ruta/a/dist:/var/lib/grafana/plugins/tobeflow-chart-panel:ro \
  -v grafana-data:/var/lib/grafana \
  --restart unless-stopped \
  grafana/grafana:11.4.0
```

---

## 4. Instalación local (sin Docker)

### 4.1 Localizar el directorio de plugins

El directorio de plugins depende de la instalación de Grafana:

| Sistema | Ruta por defecto |
|---|---|
| Linux (paquete) | `/var/lib/grafana/plugins` |
| Linux (binario) | `<grafana-dir>/data/plugins` |
| macOS (Homebrew) | `/opt/homebrew/var/lib/grafana/plugins` |
| Windows | `C:\Program Files\GrafanaLabs\grafana\data\plugins` |

Puedes verificar la ruta en **Grafana** → **Administration** → **Settings** → buscar `plugins`.

### 4.2 Copiar el plugin

```bash
# Copiar el directorio dist compilado
sudo cp -r dist/ /var/lib/grafana/plugins/tobeflow-chart-panel

# Asegurar permisos
sudo chown -R grafana:grafana /var/lib/grafana/plugins/tobeflow-chart-panel
```

> **Importante:** El nombre del directorio debe ser `tobeflow-chart-panel` (el `id` del plugin).

### 4.3 Configurar Grafana para plugins sin firma

Edita el archivo de configuración de Grafana:

**Linux:** `/etc/grafana/grafana.ini`  
**macOS:** `/opt/homebrew/etc/grafana/grafana.ini`

Añade o modifica:

```ini
[plugins]
allow_loading_unsigned_plugins = tobeflow-chart-panel
```

### 4.4 Reiniciar Grafana

```bash
# systemd
sudo systemctl restart grafana-server

# macOS Homebrew
brew services restart grafana
```

---

## 5. Instalación en Kubernetes

### 5.1 Con Helm Chart oficial de Grafana

El chart oficial de Grafana soporta plugins custom. Crea un ConfigMap con el plugin compilado o usa un init container.

#### Opción A: Init container con build local

**values.yaml:**

```yaml
image:
  repository: grafana/grafana
  tag: "11.4.0"

grafana.ini:
  plugins:
    allow_loading_unsigned_plugins: tobeflow-chart-panel

# Montar el plugin desde un PVC o ConfigMap
extraVolumeMounts:
  - name: tobeflow-plugin
    mountPath: /var/lib/grafana/plugins/tobeflow-chart-panel
    readOnly: true

extraVolumes:
  - name: tobeflow-plugin
    persistentVolumeClaim:
      claimName: tobeflow-plugin-pvc

resources:
  limits:
    memory: 512Mi
    cpu: "1"
  requests:
    memory: 256Mi
    cpu: "250m"
```

**Instalar:**

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install grafana grafana/grafana -f values.yaml -n monitoring
```

#### Opción B: Init container que descarga el plugin

Si tienes el plugin compilado disponible en un servidor HTTP o un registro de artefactos:

**values.yaml:**

```yaml
image:
  repository: grafana/grafana
  tag: "11.4.0"

grafana.ini:
  plugins:
    allow_loading_unsigned_plugins: tobeflow-chart-panel

initContainers:
  - name: install-tobeflow-plugin
    image: busybox:1.36
    command:
      - sh
      - -c
      - |
        mkdir -p /var/lib/grafana/plugins/tobeflow-chart-panel
        wget -qO- https://artifacts.ejemplo.com/tobeflow-chart-panel-1.3.0.tar.gz \
          | tar xz -C /var/lib/grafana/plugins/tobeflow-chart-panel
    volumeMounts:
      - name: grafana-plugins
        mountPath: /var/lib/grafana/plugins

extraVolumeMounts:
  - name: grafana-plugins
    mountPath: /var/lib/grafana/plugins

extraVolumes:
  - name: grafana-plugins
    emptyDir: {}
```

#### Opción C: Imagen Docker custom

Crea una imagen que incluya el plugin:

**Dockerfile:**

```dockerfile
FROM grafana/grafana:11.4.0

# Copiar plugin compilado
COPY dist/ /var/lib/grafana/plugins/tobeflow-chart-panel/

# Configurar plugins sin firma
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=tobeflow-chart-panel
```

**Build y push:**

```bash
docker build -t mi-registro.ejemplo.com/grafana-tobeflow:11.4.0-1.3.0 .
docker push mi-registro.ejemplo.com/grafana-tobeflow:11.4.0-1.3.0
```

**values.yaml:**

```yaml
image:
  repository: mi-registro.ejemplo.com/grafana-tobeflow
  tag: "11.4.0-1.3.0"

grafana.ini:
  plugins:
    allow_loading_unsigned_plugins: tobeflow-chart-panel
```

### 5.2 Sin Helm (manifiestos raw)

**ConfigMap** con el plugin (para archivos pequeños, < 1 MB cada uno):

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: tobeflow-plugin
  namespace: monitoring
binaryData:
  module.js: <base64-encoded-content>
data:
  plugin.json: |
    {
      "type": "panel",
      "name": "ToBeFlow Chart Panel",
      "id": "tobeflow-chart-panel",
      ...
    }
```

> **Nota:** Para archivos > 1 MB como `module.js` (1.5 MB), es preferible usar un init container o una imagen custom en lugar de ConfigMap.

**Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 472
        fsGroup: 472
      containers:
        - name: grafana
          image: grafana/grafana:11.4.0
          ports:
            - containerPort: 3000
          env:
            - name: GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS
              value: "tobeflow-chart-panel"
          resources:
            limits:
              memory: 512Mi
              cpu: "1"
            requests:
              memory: 256Mi
              cpu: 250m
          volumeMounts:
            - name: grafana-data
              mountPath: /var/lib/grafana
            - name: tobeflow-plugin
              mountPath: /var/lib/grafana/plugins/tobeflow-chart-panel
              readOnly: true
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
      volumes:
        - name: grafana-data
          persistentVolumeClaim:
            claimName: grafana-pvc
        - name: tobeflow-plugin
          persistentVolumeClaim:
            claimName: tobeflow-plugin-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: monitoring
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
  selector:
    app: grafana
```

---

## 6. Verificación

### Comprobar que el plugin está cargado

1. Accede a Grafana en el navegador
2. Ve a **Administration** → **Plugins**
3. Busca `ToBeFlow` — debe aparecer con tipo `Panel`

### Verificar por API

```bash
curl -s http://localhost:3000/api/plugins | grep -o '"id":"tobeflow-chart-panel"'
```

Debe devolver:
```
"id":"tobeflow-chart-panel"
```

### Comprobar logs

```bash
# Docker
docker logs grafana-prod 2>&1 | grep -i tobeflow

# Kubernetes
kubectl logs -n monitoring deploy/grafana | grep -i tobeflow

# Local
journalctl -u grafana-server | grep -i tobeflow
```

Deberías ver:
```
logger=plugin.loader msg="Plugin registered" pluginID=tobeflow-chart-panel
```

### Comprobar en un panel

1. Crea un nuevo dashboard → **Add panel**
2. En el selector de visualización busca `ToBeFlow Chart Panel`
3. Si aparece, la instalación es correcta

---

## 7. Actualización

### Proceso general

1. Compilar la nueva versión: `npm run build`
2. Reemplazar el contenido de `dist/` en la ubicación del plugin
3. Reiniciar Grafana

### Docker

```bash
# Parar, actualizar el código, recompilar
cd plugins/svg-flow-panel
git pull  # o copiar nuevos fuentes
npm install
npm run build

# Reiniciar Grafana para que recargue el plugin
docker compose restart grafana
```

### Local

```bash
# Compilar
npm run build

# Reemplazar
sudo rm -rf /var/lib/grafana/plugins/tobeflow-chart-panel/*
sudo cp -r dist/* /var/lib/grafana/plugins/tobeflow-chart-panel/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/tobeflow-chart-panel

# Reiniciar
sudo systemctl restart grafana-server
```

### Kubernetes

Con imagen custom:

```bash
# Rebuild imagen
docker build -t mi-registro.ejemplo.com/grafana-tobeflow:11.4.0-1.4.0 .
docker push mi-registro.ejemplo.com/grafana-tobeflow:11.4.0-1.4.0

# Update deployment
helm upgrade grafana grafana/grafana -f values.yaml --set image.tag=11.4.0-1.4.0
```

> **Nota:** Las configuraciones de dashboards (mapeos, SVGs, umbrales) se guardan en el JSON del dashboard, no en el plugin. Actualizar el plugin no afecta a los dashboards existentes.

---

## 8. Troubleshooting

### El plugin no aparece en la lista

| Causa | Solución |
|---|---|
| Directorio mal nombrado | Debe ser `tobeflow-chart-panel` (el `id` del plugin.json) |
| Falta `plugin.json` | Verifica que `dist/plugin.json` existe dentro del directorio del plugin |
| Falta config unsigned | Añadir `allow_loading_unsigned_plugins = tobeflow-chart-panel` |
| Grafana no reiniciado | Reiniciar Grafana tras copiar el plugin |
| Permisos incorrectos | El usuario `grafana` (UID 472) debe poder leer los archivos |

### Error "plugin not registered"

```
logger=plugin.loader level=warn msg="Skipping loading plugin" ... error="plugin is not signed"
```

**Solución:** Añadir a `grafana.ini`:

```ini
[plugins]
allow_loading_unsigned_plugins = tobeflow-chart-panel
```

O variable de entorno:

```
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=tobeflow-chart-panel
```

### El panel aparece pero no se renderiza

| Causa | Solución |
|---|---|
| `module.js` corrupto o incompleto | Recompilar con `npm run build` |
| Versión de Grafana incompatible | Requiere Grafana ≥ 10.0.0 |
| Error JS en consola | Abrir DevTools (F12) → pestaña Console para ver errores |

### Hot-reload no funciona en desarrollo

1. Verificar que el volumen se monta **sin** `:ro`
2. Verificar que `npm run dev` está ejecutándose
3. Verificar que el contenedor ve los cambios: `docker exec grafana-dev ls /var/lib/grafana/plugins/tobeflow-chart-panel/`
4. En algunos entornos puede ser necesario reiniciar el contenedor tras cambios grandes

### Permisos en Kubernetes

```bash
# Verificar que los archivos son legibles por el usuario grafana (UID 472)
kubectl exec -n monitoring deploy/grafana -- ls -la /var/lib/grafana/plugins/tobeflow-chart-panel/
```

Si hay problemas de permisos, añade al pod:

```yaml
securityContext:
  fsGroup: 472
```
