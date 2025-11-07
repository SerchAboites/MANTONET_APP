document.addEventListener('DOMContentLoaded', () => {

    // --- Referencias a los elementos ---
    const form = document.getElementById('incidencia-form');
    const generateReportButton = document.getElementById('generate-report-btn');
    const downloadReportLink = document.getElementById('download-report-link');
    const loaderOverlay = document.getElementById('loader-overlay');
    const submitButton = document.getElementById('submit-form-btn');
    const openCameraButton = document.getElementById('open-camera-btn');
    const capturePhotoButton = document.getElementById('capture-photo-btn');
    const cameraStream = document.getElementById('camera-stream');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraPlaceholder = document.getElementById('camera-placeholder');
    const hiddenImageInput = document.getElementById('imagenIncidencia');
    const cameraSelect = document.getElementById('camera-select');
    const retakePhotoButton = document.getElementById('retake-photo-btn'); // <-- AÑADIDO
    const context = cameraPreview.getContext('2d');
    let currentStream = null;
    let animationFrameId = null;

    // --- URL de tu Web App ---
    const webAppUrl = 'https://script.google.com/macros/s/AKfycbzy1leyzn0NK4S-l25S4dHgb6YcM01peULVE0bX9qMToMgDgsvoUAJJ2RLocadiZSsmzg/exec';

    // --- Lógica de Cargar Proyectos ---
    const cargarProyectos = async () => {
      const proyectoSelect = document.getElementById('proyecto-select');
      
      try {
        const response = await fetch(webAppUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({ action: 'getProyectos' })
        });

        const result = await response.json();

        if (result.status === 'error') {
          throw new Error(result.message);
        }

        poblarSelectProyectos(result.proyectos);

      } catch (error) {
        console.error('Error al cargar proyectos:', error);
        proyectoSelect.innerHTML = `<option value="" disabled selected>Error al cargar proyectos</option>`;
        alert(`Error fatal al cargar proyectos: ${error.message}. La página no funcionará correctamente.`);
      }
    };

    const poblarSelectProyectos = (proyectos) => {
      const proyectoSelect = document.getElementById('proyecto-select');
      
      proyectoSelect.innerHTML = ''; 

      if (!proyectos || proyectos.length === 0) {
        proyectoSelect.innerHTML = `<option value="" disabled selected>No se encontraron proyectos</option>`;
        return;
      }

      const defaultOption = document.createElement('option');
      defaultOption.value = "";
      defaultOption.textContent = "Selecciona un proyecto...";
      defaultOption.disabled = true;
      defaultOption.selected = true;
      proyectoSelect.appendChild(defaultOption);

      proyectos.forEach(proyecto => {
        const option = document.createElement('option');
        option.value = proyecto.id;
        option.textContent = proyecto.nombre;
        proyectoSelect.appendChild(option);
      });
    };
    
    // --- Funciones para el loader ---
    const showLoader = (message = 'Cargando...') => {
        const loaderMessage = loaderOverlay.querySelector('p');
        if (loaderMessage) {
            loaderMessage.textContent = message;
        }
        loaderOverlay.classList.remove('hidden');
    };
    const hideLoader = () => {
        loaderOverlay.classList.add('hidden');
    };

    // --- Lógica de la cámara (REESTRUCTURADA) ---

    const stopCurrentStream = () => {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    };

    const startStream = async (constraints) => {
        stopCurrentStream(); 

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // ==== INICIO DE CAMBIO: Guardar en localStorage ====
            const currentCameraId = currentStream.getVideoTracks()[0]?.getSettings()?.deviceId;
            if (currentCameraId) {
                localStorage.setItem('preferredCameraId', currentCameraId);
            }
            // ==== FIN DE CAMBIO ====

            cameraStream.srcObject = currentStream;

            cameraStream.onloadedmetadata = () => {
                
                // ==== INICIO DE CAMBIOS: Vista Previa Nítida (devicePixelRatio) ====
                
                // 1. Obtener el tamaño de píxeles lógicos (CSS)
                const containerWidth = cameraPreview.parentElement.offsetWidth;
                // 2. Obtener la densidad de píxeles del dispositivo (ej. 2x, 3x)
                const dpr = window.devicePixelRatio || 1;

                // 3. Establecer el tamaño real del bitmap del canvas (píxeles físicos)
                cameraPreview.width = containerWidth * dpr;
                cameraPreview.height = containerWidth * dpr;

                // 4. Establecer el tamaño de visualización del canvas (píxeles lógicos)
                cameraPreview.style.width = `${containerWidth}px`;
                cameraPreview.style.height = `${containerWidth}px`;

                // 5. Asegurar que el contexto sepa que está escalado
                context.scale(dpr, dpr);
                
                // ==== FIN DE CAMBIOS ====

                cameraPreview.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                startDrawingLoop(containerWidth); // Pasamos el tamaño lógico
                openCameraButton.classList.add('hidden');
                
                // ==== INICIO DE CAMBIO: Arreglo Botón "Reintentar" ====
                // Resetear el botón de captura a su estado original
                capturePhotoButton.textContent = 'Capturar Foto';
                capturePhotoButton.disabled = false;
                capturePhotoButton.classList.remove('is-captured');
                // ==== FIN DE CAMBIO ====

                capturePhotoButton.classList.remove('hidden'); // <-- MODIFICADO (asegurar que se muestre)
                retakePhotoButton.classList.add('hidden'); // <-- AÑADIDO (ocultar al reintentar)
                
                updateCameraList();
            };

        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert(`Error al iniciar la cámara: ${error.message}. ¿Diste permisos?`);
            resetCameraUI();
        }
    };

    const updateCameraList = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length <= 1) {
                cameraSelect.classList.add('hidden');
                return; 
            }

            const currentCameraId = currentStream?.getVideoTracks()[0]?.getSettings()?.deviceId;

            cameraSelect.innerHTML = '';
            videoDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Cámara ${videoDevices.indexOf(device) + 1}`;
                if (device.deviceId === currentCameraId) {
                    option.selected = true;
                }
                cameraSelect.appendChild(option);
            });
            cameraSelect.classList.remove('hidden');

        } catch (err) {
            console.error('Error enumerando dispositivos:', err);
            cameraSelect.classList.add('hidden');
        }
    };

    /**
     * (Función original modificada) Inicia la cámara por primera vez
     */
    const openCamera = async () => {

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("navigator.mediaDevices.getUserMedia no está disponible.");
            alert("No se puede acceder a la cámara. Asegúrate de que estás en una conexión segura (https://) y has concedido permisos.");
            return;
        }
        
        // ==== INICIO DE CAMBIO: Leer de localStorage ====
        const preferredCameraId = localStorage.getItem('preferredCameraId');
        if (preferredCameraId) {
            try {
                console.log('Intentando abrir cámara preferida:', preferredCameraId);
                const preferredConstraints = { 
                    video: { 
                        deviceId: { exact: preferredCameraId },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        advanced: [
                            { focusMode: 'continuous' }
                        ]
                    } 
                };
                await startStream(preferredConstraints);
                return; // Si tiene éxito, salimos de la función
            } catch (err) {
                console.warn('No se pudo abrir la cámara preferida. Volviendo al default.', err);
                localStorage.removeItem('preferredCameraId'); // Limpiar ID inválido
            }
        }
        // ==== FIN DE CAMBIO ====
        
        // ==== INICIO DE CAMBIOS: Solicitud de Enfoque Continuo ====
        
        const constraints_hd_rear = { 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                advanced: [ // Pedir enfoque continuo
                    { focusMode: 'continuous' }
                ]
            } 
        };
        
        try {
            await startStream(constraints_hd_rear);
        } catch (err) {
            console.warn("Fallo al obtener 'environment' en HD. Probando frontal/default en HD.");
            
            const constraints_hd_front = { 
                video: { 
                    width: { ideal: 1920 }, 
                    height: { ideal: 1080 },
                    advanced: [ // También para la frontal, por si acaso
                        { focusMode: 'continuous' }
                    ]
                } 
            };
            
            try {
                await startStream(constraints_hd_front);
            } catch (err2) {
                console.warn("Fallaron las cámaras HD. Probando 'video: true' (baja res)");
                await startStream({ video: true }); 
            }
        }
        // ==== FIN DE CAMBIOS ====
    };

    const resetCameraUI = () => {
        stopCurrentStream();
        
        // ==== INICIO DE CAMBIOS: Reset con devicePixelRatio ====
        const containerWidth = cameraPreview.parentElement.offsetWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        
        // Limpiar el contexto antes de redimensionar
        context.clearRect(0, 0, cameraPreview.width, cameraPreview.height);

        // Resetear la transformación de escala
        context.setTransform(1, 0, 0, 1, 0, 0); 
        
        // Devolver el canvas al tamaño del contenedor
        cameraPreview.width = containerWidth * dpr;
        cameraPreview.height = containerWidth * dpr;
        cameraPreview.style.width = `${containerWidth}px`;
        cameraPreview.style.height = `${containerWidth}px`;
        // ==== FIN DE CAMBIOS ====
        
        cameraPreview.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'La cámara está apagada';
        capturePhotoButton.classList.add('hidden'); // <-- MODIFICADO (asegurar que se oculte)
        capturePhotoButton.textContent = 'Capturar Foto';
        capturePhotoButton.disabled = false;
        capturePhotoButton.classList.remove('is-captured');
        openCameraButton.classList.remove('hidden');
        hiddenImageInput.value = '';
        cameraSelect.classList.add('hidden'); 
        retakePhotoButton.classList.add('hidden'); // <-- AÑADIDO
    };


    // Dibuja el video en el canvas de VISTA PREVIA
    const startDrawingLoop = (containerWidth) => {
        const draw = () => {
            if (!currentStream) return;
            const videoWidth = cameraStream.videoWidth;
            const videoHeight = cameraStream.videoHeight;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;
            
            // Limpiar canvas
            context.clearRect(0, 0, containerWidth, containerWidth); 
            // Dibuja el "cuadrado" del video en el canvas (tamaño lógico)
            context.drawImage(cameraStream, x, y, size, size, 0, 0, containerWidth, containerWidth);
            
            animationFrameId = requestAnimationFrame(draw);
        };
        draw();
    };

    /**
     * (Función modificada) Captura la foto en alta resolución
     */
    const capturePhoto = () => {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

        // 1. Obtener dimensiones NATIVAS del video
        const videoWidth = cameraStream.videoWidth;
        const videoHeight = cameraStream.videoHeight;

        // 2. Calcular el corte cuadrado
        const size = Math.min(videoWidth, videoHeight);
        const x = (videoWidth - size) / 2;
        const y = (videoHeight - size) / 2;

        // ==== INICIO DE CAMBIOS: Captura HD (Corregido) ====
        
        // 3. Resetear la escala del contexto para dibujar 1:1
        context.setTransform(1, 0, 0, 1, 0, 0); 

        // 4. Redimensionar el bitmap del canvas a la resolución de CAPTURA (ej. 1080x1080)
        cameraPreview.width = size;
        cameraPreview.height = size;
        
        // 5. Dibujar el frame de alta res 1:1
        context.drawImage(cameraStream, x, y, size, size, 0, 0, size, size);

        // 6. Capturar la imagen del canvas (que ahora es de alta res)
        const imageDataUrl = cameraPreview.toDataURL('image/jpeg', 0.9);
        hiddenImageInput.value = imageDataUrl;
        
        // ==== FIN DE CAMBIOS ====

        // 7. Detener el stream y actualizar UI
        stopCurrentStream(); 
        
        capturePhotoButton.textContent = 'Foto Capturada ✔';
        capturePhotoButton.classList.add('is-captured');
        capturePhotoButton.disabled = true;
        capturePhotoButton.classList.add('hidden'); // <-- AÑADIDO (ocultar después de capturar)
        retakePhotoButton.classList.remove('hidden'); // <-- AÑADIDO (mostrar "Reintentar")
        cameraSelect.classList.add('hidden');
    };
    
    // --- Lógica de envío ---
    const handleFormSubmit = async (event) => {
        event.preventDefault();
        if (!hiddenImageInput.value) { alert('Por favor, captura una foto de evidencia.'); return; }
        
        const payload = Object.fromEntries(new FormData(form));
        payload.imagenBase64 = payload.imagenIncidencia;
        delete payload.imagenIncidencia;
        
        showLoader('Registrando incidencia...');
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow', 
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8' 
                },
                body: JSON.stringify({ action: 'registrarIncidencia', payload: payload })
            });

            const result = await response.json();
            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert(`¡Incidencia registrada con éxito! ID: ${result.newId}`);
            resetForm();
            
        } catch (error) {
            alert(`Hubo un error al registrar la incidencia: ${error.message}`);
        } finally {
            hideLoader();
        }
    };
    
    // --- Lógica de reporte ---
    const handleGenerateReport = async () => {
        const proyectoSelect = document.getElementById('proyecto-select');
        const proyectoSheetId = proyectoSelect.value;
        
        if (!proyectoSheetId) {
            alert("Por favor, selecciona un proyecto antes de generar un reporte.");
            return;
        }

        showLoader('Generando reporte en Drive...');
        downloadReportLink.classList.add('hidden');
        
        try {
            const response = await fetch(webAppUrl, {
                method: 'POST',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({ 
                    action: 'generarReporte',
                    payload: { proyectoSheetId: proyectoSheetId } 
                })
            });

            const result = await response.json(); 

            if (result.status === 'error') {
                throw new Error(result.message);
            }

            alert('Reporte generado. ¡Ya puedes descargarlo!');
            
            downloadReportLink.href = result.downloadUrl; 
            downloadReportLink.target = "_blank";
            downloadReportLink.classList.remove('hidden');

        } catch (error) {
            alert(`Hubo un error al generar el reporte: ${error.message}`);
        } finally {
            hideLoader();
        }
    };

    // --- resetForm ---
    const resetForm = () => {
        form.reset();
        resetCameraUI();
        
        const proyectoSelect = document.getElementById('proyecto-select');
        if (proyectoSelect) {
            proyectoSelect.selectedIndex = 0;
        }
    };

    // ==== INICIO DE NUEVA FUNCIÓN ====
    /**
     * Intenta forzar un re-enfoque de la cámara (Tap-to-Focus)
     */
    const handleManualFocus = async () => {
        if (!currentStream) return; // No hacer nada si la cámara está apagada

        const track = currentStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();

        // Verificar si el dispositivo soporta 'focusMode'
        if (!capabilities.focusMode) {
            console.warn('El dispositivo no soporta focusMode.');
            return;
        }

        try {
            // 1. Aplicar 'manual' despierta el motor de enfoque
            await track.applyConstraints({
                advanced: [{ focusMode: 'manual' }]
            });
            
            // 2. Volver immediately a 'continuous' para que re-enfoque
            await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
            });
            console.log('Re-enfoque solicitado.');
        } catch (err) {
            console.error('Error al aplicar constraints de enfoque:', err);
        }
    };
    // ==== FIN DE NUEVA FUNCIÓN ====


    // --- Asignar eventos ---
    
    cargarProyectos();
    form.addEventListener('submit', handleFormSubmit);
    generateReportButton.addEventListener('click', handleGenerateReport);
    openCameraButton.addEventListener('click', openCamera);
    capturePhotoButton.addEventListener('click', capturePhoto);
    retakePhotoButton.addEventListener('click', openCamera); // <-- AÑADIDO
    cameraPreview.addEventListener('click', handleManualFocus); // <-- AÑADIDO (Tap-to-Focus)

    // Listener para el CAMBIO de cámara
    cameraSelect.addEventListener('change', (e) => {
        const newCameraId = e.target.value;
        if (newCameraId) {
            
            // ==== INICIO DE CAMBIOS: Enfoque Continuo al cambiar ====
            startStream({ 
                video: { 
                    deviceId: { exact: newCameraId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    advanced: [
                        { focusMode: 'continuous' }
                    ]
                } 
            });
            // ==== FIN DE CAMBIOS ====
        }
    });
});